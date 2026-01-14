/**
 * Notification Settings Page
 *
 * Notification preferences management.
 *
 * Features:
 * - Email notification preferences
 * - Reservation reminders
 * - Marketing communications
 *
 * Note: This page contains stub functions as notifications
 * are not yet implemented in the database schema.
 *
 * @route /account/notifications
 * @authenticated
 */
<script setup lang="ts">
definePageMeta({
  title: 'Notification Settings',
  description: 'Manage your notification preferences',
})

const toast = useToast()

// Notification preferences state (stub - not persisted yet)
const preferences = reactive({
  reservationConfirmations: true,
  reservationReminders: true,
  showAnnouncements: true,
  marketingEmails: false,
})

const isSubmitting = ref(false)

// Stub function - will be implemented when notifications are added to the database
async function savePreferences() {
  isSubmitting.value = true

  try {
    // TODO: Implement API call when notifications schema is ready
    // await $fetch('/api/account/notifications', {
    //   method: 'PUT',
    //   body: preferences,
    // })

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))

    toast.add({
      title: 'Preferences saved',
      description: 'Your notification preferences have been updated.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: 'Error',
      description: 'Failed to save notification preferences.',
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      title="Notifications"
      description="Manage how and when you receive notifications."
      variant="naked"
      orientation="horizontal"
    >
      <template #default>
        <div class="lg:ms-auto">
          <UButton
            label="Save preferences"
            color="neutral"
            :loading="isSubmitting"
            @click="savePreferences"
          />
        </div>
      </template>
    </UPageCard>

    <UPageCard
      title="Email notifications"
      description="Choose which emails you'd like to receive."
      variant="subtle"
    >
      <div class="space-y-1">
        <div class="flex items-center justify-between py-3">
          <div>
            <p class="font-medium text-highlighted">
              Reservation confirmations
            </p>
            <p class="text-sm text-muted">
              Receive confirmation emails when you make a reservation.
            </p>
          </div>
          <USwitch v-model="preferences.reservationConfirmations" />
        </div>

        <USeparator />

        <div class="flex items-center justify-between py-3">
          <div>
            <p class="font-medium text-highlighted">
              Reservation reminders
            </p>
            <p class="text-sm text-muted">
              Get reminded about upcoming shows you have reservations for.
            </p>
          </div>
          <USwitch v-model="preferences.reservationReminders" />
        </div>

        <USeparator />

        <div class="flex items-center justify-between py-3">
          <div>
            <p class="font-medium text-highlighted">
              Show announcements
            </p>
            <p class="text-sm text-muted">
              Receive emails about new shows and special events.
            </p>
          </div>
          <USwitch v-model="preferences.showAnnouncements" />
        </div>

        <USeparator />

        <div class="flex items-center justify-between py-3">
          <div>
            <p class="font-medium text-highlighted">
              Marketing emails
            </p>
            <p class="text-sm text-muted">
              Receive promotional emails and newsletters.
            </p>
          </div>
          <USwitch v-model="preferences.marketingEmails" />
        </div>
      </div>
    </UPageCard>

    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Coming soon"
      description="Notification preferences will be saved once the feature is fully implemented. For now, changes are not persisted."
    />
  </div>
</template>
