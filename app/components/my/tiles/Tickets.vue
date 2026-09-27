<script setup lang="ts">
import { saysWhen } from '#shared/utils/when'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()
</script>

<template>
  <!-- The booking opens through its link route, which sets the cookie the booking page reads, so
       it is a plain link rather than an in-app one (issue 1332, as issue 1329 found). -->
  <MyTile
    title="Tickets"
    :to="summary.ticket ? '/qr' : '/whats-on'"
    label="See all your bookings"
    :empty="!summary.ticket"
    empty-title="No bookings to come"
    empty-label="See what is on"
  >
    <a
      v-if="summary.ticket"
      :href="summary.ticket.url"
      class="block"
    >
      <span class="block font-semibold">{{ summary.ticket.showTitle }}</span>
      <span class="block text-sm text-muted">{{ saysWhen(summary.ticket.startsAt) }} · {{ summary.ticket.venueName }}</span>
      <span class="mt-2 block text-sm font-medium text-primary">Open booking {{ summary.ticket.reference }}</span>
    </a>
  </MyTile>
</template>
