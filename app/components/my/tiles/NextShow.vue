<script setup lang="ts">
import { saysDay } from '#shared/utils/when'
import { saysAvailability } from '#shared/utils/programme'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()

const sayDay = (at: number): string => saysDay(at)
</script>

<template>
  <MyTile
    title="Next show on sale"
    :to="`/shows/${summary.nextShow?.slug}`"
    label="See the show"
    class="lg:col-span-2"
  >
    <p class="font-semibold">
      {{ summary.nextShow?.title }}
    </p>
    <p class="text-sm text-muted">
      {{ summary.nextShow && sayDay(summary.nextShow.firstAt) }} to {{ summary.nextShow && sayDay(summary.nextShow.lastAt) }}
    </p>
    <UBadge
      v-if="summary.nextShow"
      color="neutral"
      variant="subtle"
      class="mt-2"
    >
      {{ saysAvailability(summary.nextShow.availability, null) }}
    </UBadge>
  </MyTile>
</template>
