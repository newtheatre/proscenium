<script setup lang="ts">
import { saysWhen } from '#shared/utils/when'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()
</script>

<template>
  <!-- The booking opens through its link route, which sets the cookie the booking page reads, so
       the card loads it rather than routing in the app (issue 1332, as issue 1329 found). -->
  <MyTile
    title="Tickets"
    :to="summary.ticket?.url ?? '/qr'"
    :label="`Open booking ${summary.ticket?.reference ?? ''}`"
    external
  >
    <p class="font-semibold">
      {{ summary.ticket?.showTitle }}
    </p>
    <p class="text-sm text-muted">
      {{ summary.ticket && saysWhen(summary.ticket.startsAt) }} · {{ summary.ticket?.venueName }}
    </p>
  </MyTile>
</template>
