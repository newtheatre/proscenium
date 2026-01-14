/**
 * Account Overview Page
 *
 * User profile management.
 *
 * Features:
 * - Update name and email
 * - Form validation with Zod
 * - Email verification status
 * - Account information
 *
 * Data Updates:
 * - PUT /api/users/:id (name, email)
 *
 * @route /account
 * @authenticated
 */
<script setup lang="ts">
import { upperFirst } from 'scule'
import z from 'zod/v4'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  title: 'My Account',
  description: 'View and manage your account',
})

const { user, fetch: refreshSession } = useUserSession()
const toast = useToast()

// Profile validation schema
const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.email('Invalid email address'),
})

type ProfileSchema = z.output<typeof profileSchema>

// Profile state - populated from user session
const profile = reactive<Partial<ProfileSchema>>({
  name: user.value?.name || '',
  email: user.value?.email || '',
})

const isSubmitting = ref(false)
const verificationLoading = ref(false)

function formatRole(role: string) {
  return upperFirst(role.toLowerCase().replace(/_/g, ' '))
}

// Submit profile updates
async function onSubmit(event: FormSubmitEvent<ProfileSchema>) {
  isSubmitting.value = true

  try {
    await $fetch(`/api/users/${user.value?.id}`, {
      method: 'PUT',
      body: event.data,
    })

    await refreshSession()

    toast.add({
      title: 'Success',
      description: 'Your profile has been updated.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (error: unknown) {
    let message = 'Failed to update profile'
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const fetchError = error as { statusCode: number, data?: { statusMessage?: string } }
      if (fetchError.statusCode === 400) {
        message = fetchError.data?.statusMessage || 'This email is already in use'
      }
    }

    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function requestVerification() {
  verificationLoading.value = true

  try {
    await $fetch('/api/auth/email/request', {
      method: 'POST',
      body: { email: user.value?.email },
    })
    toast.add({
      title: 'Verification email sent',
      description: 'Please check your inbox for the verification link.',
      icon: 'i-lucide-mail',
      color: 'success',
    })
  }
  catch (error: unknown) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to send verification email',
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    verificationLoading.value = false
  }
}

// Watch for user changes to update form state
watch(() => user.value, (newUser) => {
  if (newUser) {
    profile.name = newUser.name || ''
    profile.email = newUser.email || ''
  }
}, { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <!-- Email Verification Alert -->
    <UAlert
      v-if="!user?.verified"
      color="warning"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      title="Email not verified"
      description="Please verify your email address to access all features."
    >
      <template #actions>
        <UButton
          label="Resend verification email"
          color="warning"
          variant="soft"
          size="xs"
          :loading="verificationLoading"
          @click="requestVerification"
        />
      </template>
    </UAlert>

    <!-- Profile Form -->
    <UForm
      id="profile-settings"
      :schema="profileSchema"
      :state="profile"
      class="space-y-6"
      @submit="onSubmit"
    >
      <UPageCard
        title="Profile"
        description="Your personal information."
        variant="naked"
        orientation="horizontal"
      >
        <template #default>
          <div class="lg:ms-auto">
            <UButton
              form="profile-settings"
              label="Save changes"
              color="neutral"
              type="submit"
              :loading="isSubmitting"
            />
          </div>
        </template>
      </UPageCard>

      <UPageCard variant="subtle">
        <UFormField
          name="name"
          label="Name"
          description="Your full name as it will appear on reservations."
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.name"
            autocomplete="name"
            placeholder="Your name"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="email"
          label="Email"
          description="Used to sign in and receive reservation notifications."
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.email"
            type="email"
            autocomplete="email"
            placeholder="your.email@example.com"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="roles"
          label="Roles"
          description="Your current permission levels in the system."
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <div
            v-if="user?.roles?.length"
            class="flex flex-wrap gap-1"
          >
            <UBadge
              v-for="role in user?.roles"
              :key="role"
              color="primary"
              variant="subtle"
              :label="formatRole(role)"
            />
          </div>
          <UBadge
            v-else
            color="neutral"
            variant="subtle"
            label="Standard"
          />
        </UFormField>
      </UPageCard>
    </UForm>

    <!-- Account Information -->
    <UPageCard
      title="Account information"
      description="Your account details and membership information."
      variant="subtle"
    >
      <div class="flex flex-col gap-4">
        <div>
          <div class="text-sm font-medium text-muted mb-1">
            Email verified
          </div>
          <UBadge
            :color="user?.verified ? 'success' : 'warning'"
            variant="subtle"
            :label="user?.verified ? 'Verified' : 'Not verified'"
          />
        </div>
        <div>
          <div class="text-sm font-medium text-muted mb-1">
            User ID
          </div>
          <div class="font-mono text-xs">
            {{ user?.id || 'Loading...' }}
          </div>
        </div>
      </div>
    </UPageCard>
  </div>
</template>
