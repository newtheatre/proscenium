/**
 * Security Settings Page
 *
 * Password management and account security.
 *
 * Features:
 * - Change password with validation
 * - Password strength requirements
 * - Current password verification
 * - Account deletion
 *
 * Data Updates:
 * - PUT /api/users/:id (password)
 * - DELETE /api/users/:id (account deletion)
 *
 * @route /account/security
 * @authenticated
 */
<script setup lang="ts">
import z from 'zod/v4'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  title: 'Security Settings',
  description: 'Manage your password and account security',
})

const { user, clear } = useUserSession()
const toast = useToast()

const isSubmitting = ref(false)

// Password validation schema
const passwordSchema = z.object({
  current: z.string().min(1, 'Current password is required'),
  new: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

type PasswordSchema = z.output<typeof passwordSchema>

const password = reactive<Partial<PasswordSchema>>({
  current: undefined,
  new: undefined,
})

const validate = (state: Partial<PasswordSchema>): FormError[] => {
  const errors: FormError[] = []
  if (state.current && state.new && state.current === state.new) {
    errors.push({ name: 'new', message: 'New password must be different from current password' })
  }
  return errors
}

async function onPasswordSubmit(event: FormSubmitEvent<PasswordSchema>) {
  isSubmitting.value = true

  try {
    // First verify the current password by attempting login
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        email: user.value?.email,
        password: event.data.current,
      },
    })

    // Then update the password
    await $fetch(`/api/users/${user.value?.id}`, {
      method: 'PUT',
      body: {
        password: event.data.new,
      },
    })

    toast.add({
      title: 'Password updated',
      description: 'Your password has been changed successfully.',
      icon: 'i-lucide-check',
      color: 'success',
    })

    // Reset form
    password.current = undefined
    password.new = undefined
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update password'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

// Delete account
const deleteModalOpen = ref(false)
const isDeleting = ref(false)

const isAdmin = computed(() => user.value?.roles?.includes('ADMIN'))

async function deleteAccount() {
  isDeleting.value = true

  try {
    await $fetch(`/api/users/${user.value?.id}`, { method: 'DELETE' })
    await clear()

    toast.add({
      title: 'Account deleted',
      description: 'Your account has been permanently deleted.',
      icon: 'i-lucide-check',
      color: 'success',
    })

    await navigateTo('/')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete account'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isDeleting.value = false
    deleteModalOpen.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UPageHeader
      title="Security"
      description="Manage your password and account security."
    />

    <UPageCard
      title="Password"
      description="Update your password. Must be at least 8 characters with uppercase, lowercase, and a number."
      variant="subtle"
    >
      <UForm
        :schema="passwordSchema"
        :state="password"
        :validate="validate"
        class="flex flex-col gap-4 max-w-xs"
        @submit="onPasswordSubmit"
      >
        <!-- Hidden username field for password managers -->
        <input
          type="text"
          name="username"
          :value="user?.email"
          autocomplete="username"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
        >

        <UFormField
          name="current"
          label="Current password"
          required
        >
          <UInput
            v-model="password.current"
            type="password"
            placeholder="Enter current password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="new"
          label="New password"
          required
          help="Min 8 characters, 1 uppercase, 1 lowercase, 1 number"
        >
          <UInput
            v-model="password.new"
            type="password"
            placeholder="Enter new password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>

        <UButton
          label="Update password"
          class="w-fit"
          type="submit"
          :loading="isSubmitting"
        />
      </UForm>
    </UPageCard>

    <UPageCard
      title="Delete Account"
      description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
      class="bg-linear-to-tl from-error/10 from-5% to-default"
    >
      <template #description>
        <UAlert
          v-if="isAdmin"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Admin accounts cannot be self-deleted"
          description="Another admin must remove your admin role first before you can delete your account."
          class="mt-4"
        />
      </template>

      <template #footer>
        <UButton
          label="Delete account"
          color="error"
          :disabled="isAdmin"
          @click="deleteModalOpen = true"
        />
      </template>
    </UPageCard>

    <!-- Delete Account Confirmation Modal -->
    <UModal
      v-model:open="deleteModalOpen"
      title="Delete Account"
      description="This action cannot be undone. Are you absolutely sure?"
    >
      <template #body>
        <div class="space-y-4">
          <div class="p-3 rounded-md bg-error/10 border border-error/20">
            <div class="flex gap-2">
              <UIcon
                name="i-lucide-alert-triangle"
                class="text-error shrink-0 mt-0.5"
              />
              <div class="text-sm text-error">
                <p class="font-medium mb-1">
                  Warning: This action is permanent!
                </p>
                <ul class="list-disc list-inside space-y-1">
                  <li>Your account will be permanently deleted</li>
                  <li>Your reservation history will be preserved but unlinked from your account</li>
                  <li>You will lose access to all reservations and data</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>
            </div>
          </div>

          <p class="text-sm text-muted">
            If you're sure you want to proceed, click the button below to permanently delete your account.
          </p>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            @click="deleteModalOpen = false"
          />
          <UButton
            label="Delete My Account"
            color="error"
            :loading="isDeleting"
            @click="deleteAccount"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
