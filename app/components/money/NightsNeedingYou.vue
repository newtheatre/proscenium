<script setup lang="ts">
import { can, viewFinanceReports } from '#shared/utils/abilities'
import { nightsNeedingYou, reconciliationHref } from '#shared/utils/night-reconciliation'
import { saysDay } from '#shared/utils/when'
import type { OutstandingNight } from '#shared/utils/night-reconciliation'

// Nights with takings and no Z reading, and readings still disagreeing, each linked to its own
// reconciliation and never cut short (I-104 criterion 5, issue 1360). Nothing shows when none wait.

const request = useRequestFetch()
const reads = computed(() => can(useViewer().value, viewFinanceReports))

const { data } = await useAsyncData(
  'nights-needing-you',
  () => (reads.value
    ? request<{ missing: OutstandingNight[], openVariance: OutstandingNight[] }>('/api/admin/finance/reconciliation/outstanding')
    : Promise.resolve({ missing: [], openVariance: [] })),
  { watch: [reads], default: () => ({ missing: [], openVariance: [] }) },
)

const nights = computed(() => nightsNeedingYou(data.value))
</script>

<template>
  <UPageCard
    v-if="nights.length"
    id="nights-needing-you"
    title="Needs you: nights to reconcile"
    :description="`${plural(nights.length, 'night')} with takings and no Z reading, or a reading that still disagrees with what we expect.`"
    data-test="nights-needing-you"
  >
    <ul class="divide-y divide-default text-sm">
      <li
        v-for="entry in nights"
        :key="entry.night"
        class="flex flex-wrap items-baseline justify-between gap-x-3 py-2"
      >
        <ULink
          :to="reconciliationHref(entry.night)"
          exact-query
          :data-test="`needs-you-${entry.night}`"
        >
          {{ saysDay(entry.night) }}
        </ULink>
        <UBadge
          :color="entry.says === 'Open variance' ? 'warning' : 'neutral'"
          variant="subtle"
          size="sm"
        >
          {{ entry.says }}
        </UBadge>
      </li>
    </ul>
  </UPageCard>
</template>
