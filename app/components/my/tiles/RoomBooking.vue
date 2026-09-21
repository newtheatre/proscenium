<script setup lang="ts">
import { saysWhen } from '#shared/utils/when'
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
      {{ summary.room && saysWhen(summary.room.startsAt) }}
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
