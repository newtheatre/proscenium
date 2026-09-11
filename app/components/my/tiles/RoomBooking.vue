<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()
</script>

<template>
  <MyTile
    title="Next room booking"
    to="/rooms/mine"
    label="See my bookings"
    :empty="!summary.room"
    empty-title="No room booked"
    empty-label="Book a room"
  >
    <p class="font-semibold">
      {{ summary.room?.roomName }}
    </p>
    <p class="text-sm text-muted">
      {{ summary.room && formatLondon(new Date(summary.room.startsAt * 1000), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
    </p>
    <p
      v-if="summary.room?.purpose"
      class="text-sm text-muted"
    >
      {{ summary.room.purpose }}
    </p>
    <p
      v-if="summary.room?.cancellable"
      class="mt-2 text-sm text-muted"
    >
      You may still cancel this
    </p>
  </MyTile>
</template>
