<script setup lang="ts">
import { can, viewFinanceReports } from '#shared/utils/abilities'
import { nightsNeedingYou, reconciliationHref } from '#shared/utils/night-reconciliation'
import { saysDay } from '#shared/utils/when'
import type { Outstanding } from '#shared/utils/night-reconciliation'

// Nights with no Z reading, readings still disagreeing or replaced by another bar's close, each
// linked to its own reconciliation and never cut short (I-104 criterion 5). Nothing shows when none wait.

const request = useRequestFetch()
const reads = computed(() => can(useViewer().value, viewFinanceReports))

const { data } = await useAsyncData(
  'nights-needing-you',
  () => (reads.value
    ? request<Outstanding>('/api/admin/finance/reconciliation/outstanding')
    : Promise.resolve<Outstanding>({ missing: [], openVariance: [], replaced: [] })),
  { watch: [reads], default: (): Outstanding => ({ missing: [], openVariance: [], replaced: [] }) },
)

const nights = computed(() => nightsNeedingYou(data.value))
</script>

<template>
  <UPageCard
    v-if="nights.length"
    id="nights-needing-you"
    title="Needs you: nights to reconcile"
    :description="`${plural(nights.length, 'night')} ${nights.length === 1 ? 'needs' : 'need'} you: no Z reading, a reading that disagrees with what we expect, or one bar's close that replaced another bar's different reading.`"
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
          :color="entry.says === 'No reading' ? 'neutral' : 'warning'"
          variant="subtle"
          size="sm"
        >
          {{ entry.says }}
        </UBadge>
      </li>
    </ul>
  </UPageCard>
</template>
