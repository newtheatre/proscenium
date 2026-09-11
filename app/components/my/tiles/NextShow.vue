<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysAvailability } from '#shared/utils/programme'
import type { MySummary } from '#shared/utils/my-summary'

defineProps<{ summary: MySummary }>()

const sayDay = (at: number): string => formatLondon(new Date(at * 1000), { day: 'numeric', month: 'short' })
</script>

<template>
  <MyTile
    title="Next show on sale"
    :to="summary.nextShow ? `/shows/${summary.nextShow.slug}` : '/whats-on'"
    label="What's on"
    :empty="!summary.nextShow"
    empty-title="Nothing on sale yet"
    empty-label="What's on"
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
