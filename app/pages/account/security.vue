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
    // The server verifies the current password before applying the change.
    await $fetch(`/api/users/${user.value?.id}`, {
      method: 'PUT',
      body: {
        currentPassword: event.data.current,
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

// Close or delete account
const deleteModalOpen = ref(false)
const isDeleting = ref(false)

const isAdmin = computed(() => user.value?.roles?.includes('ADMIN'))

/**
 * What actually happens depends on whether there is booking history.
 *
 * The sales record has to be kept for the treasurer's accounts, and the
 * database enforces that — so an account with bookings cannot be deleted, only
 * emptied of the person. The page used to promise permanent deletion of
 * everything regardless, which was not true for anyone who had ever booked.
 */
const { data: myBookings } = await useFetch<{ upcoming: unknown[], past: unknown[] }>('/api/bookings/my', { lazy: true })

const bookingCount = computed(() =>
  (myBookings.value?.upcoming?.length ?? 0) + (myBookings.value?.past?.length ?? 0),
)
const hasPendingBooking = computed(() => (myBookings.value?.upcoming?.length ?? 0) > 0)
const willAnonymise = computed(() => bookingCount.value > 0)

async function deleteAccount() {
  isDeleting.value = true

  try {
    if (willAnonymise.value) {
      await $fetch(`/api/users/${user.value?.id}/anonymise`, { method: 'POST' })
    }
    else {
      await $fetch(`/api/users/${user.value?.id}`, { method: 'DELETE' })
    }
    await clear()

    toast.add({
      title: willAnonymise.value ? 'Account closed' : 'Account deleted',
      description: willAnonymise.value
        ? 'Your personal details have been removed. Your booking records are kept without them.'
        : 'Your account has been permanently deleted.',
      icon: 'i-lucide-check',
      color: 'success',
    })

    await navigateTo('/')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Could not close your account'),
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
      :title="willAnonymise ? 'Close Account' : 'Delete Account'"
      :description="willAnonymise
        ? 'Removes your name, email address and any notes from our records. Your bookings themselves are kept, without anything identifying you, because the theatre has to keep its sales records. This cannot be undone.'
        : 'You have no bookings on this account, so it can be removed outright. This cannot be undone.'"
      class="bg-linear-to-tl from-error/10 from-5% to-default"
    >
      <template #description>
        <UAlert
          v-if="isAdmin"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Admin accounts cannot be closed here"
          description="Another admin needs to remove your admin role first, so it is clear who is taking that responsibility on."
          class="mt-4"
        />
        <UAlert
          v-else-if="hasPendingBooking"
          color="warning"
          variant="subtle"
          icon="i-lucide-ticket"
          title="You have a booking that has not been collected"
          description="Cancel it first, otherwise the box office will have a booking on the door with no name against it."
          class="mt-4"
        />
      </template>

      <template #footer>
        <UButton
          :label="willAnonymise ? 'Close account' : 'Delete account'"
          color="error"
          :disabled="isAdmin || hasPendingBooking"
          @click="() => { deleteModalOpen = true }"
        />
      </template>
    </UPageCard>

    <!-- Delete Account Confirmation Modal -->
    <UModal
      v-model:open="deleteModalOpen"
      :title="willAnonymise ? 'Close Account' : 'Delete Account'"
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
                  This is permanent.
                </p>
                <ul
                  v-if="willAnonymise"
                  class="list-disc list-inside space-y-1"
                >
                  <li>Your name, email address and any notes are erased</li>
                  <li>Your {{ bookingCount }} booking{{ bookingCount === 1 ? '' : 's' }} stay in the theatre's sales records, with nothing identifying you</li>
                  <li>You will be signed out and will not be able to sign in again</li>
                  <li>You can book again in future, as a new account</li>
                </ul>
                <ul
                  v-else
                  class="list-disc list-inside space-y-1"
                >
                  <li>Your account is removed outright</li>
                  <li>You have no bookings, so there is nothing to keep</li>
                  <li>You will be signed out and will not be able to sign in again</li>
                </ul>
              </div>
            </div>
          </div>

          <p class="text-sm text-muted">
            If you have any questions about what is kept and why, the box office can explain before you do this.
          </p>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            @click="() => { deleteModalOpen = false }"
          />
          <UButton
            :label="willAnonymise ? 'Close My Account' : 'Delete My Account'"
            color="error"
            :loading="isDeleting"
            @click="deleteAccount"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
