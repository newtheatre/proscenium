/**
 * Reservations Page
 *
 * User reservations management.
 *
 * Features:
 * - View upcoming reservations
 * - View past reservations
 * - Reservation details
 *
 * @route /account/reservations
 * @authenticated
 */
<script setup lang="ts">
definePageMeta({
  title: 'My Reservations',
  description: 'View and manage your reservations',
})
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      title="My Reservations"
      description="Your upcoming and past show reservations."
      variant="naked"
    />

    <!-- Upcoming Reservations -->
    <UPageCard
      title="Upcoming"
      description="Shows you have tickets for."
      variant="subtle"
    >
      <UEmpty
        icon="i-lucide-calendar"
        title="No upcoming reservations"
        description="You don't have any upcoming show reservations."
      />

      <!-- TODO: Replace with actual reservations list when implemented -->
      <!--
      <UTable
        :data="upcomingReservations"
        :columns="reservationColumns"
      />
      -->
    </UPageCard>

    <!-- Past Reservations -->
    <UPageCard
      title="Past"
      description="Shows you've previously attended."
      variant="subtle"
    >
      <UEmpty
        icon="i-lucide-history"
        title="No past reservations"
        description="Your reservation history will appear here."
      />

      <!-- TODO: Replace with actual reservations list when implemented -->
      <!--
      <UTable
        :data="pastReservations"
        :columns="reservationColumns"
      />
      -->
    </UPageCard>
  </div>
</template>
