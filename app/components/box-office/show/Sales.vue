<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysWhen } from '#shared/utils/when'
import { soldShare } from '#shared/utils/show-strip'
import type { TableColumn } from '@nuxt/ui'
import type { VNode } from 'vue'
import type { AdminPerformance } from '#shared/utils/programme'

// How the run is selling, performance by performance. Seven rows of magnitude are a table, not a
// chart, and an externally ticketed performance has no house figure of ours to report (D-122).

const props = defineProps<{ performances: AdminPerformance[] }>()

const UProgress = resolveComponent('UProgress')

const capacityOf = (one: AdminPerformance): number | null =>
  (one.externalBookingUrl ? null : one.capacityOverride ?? one.venueCapacity)

const rows = computed(() => props.performances)

const figure = (value: string): VNode => h('span', { class: 'font-mono text-sm' }, value)

// A cancelled performance sells nothing more and owes no payment, so the run leaves it out.
const counted = computed(() => rows.value.filter(one => !one.externalBookingUrl && one.status !== 'CANCELLED'))
const unpaidTotal = computed(() => counted.value.reduce((sum, one) => sum + one.unpaidTickets, 0))
const soldTotal = computed(() => counted.value.reduce((sum, one) => sum + one.soldTickets, 0))
const capacityTotal = computed(() => counted.value.reduce((sum, one) => sum + (capacityOf(one) ?? 0), 0))
const leftOf = (one: AdminPerformance): number | null => {
  const capacity = capacityOf(one)
  return capacity === null ? null : Math.max(capacity - one.soldTickets, 0)
}
// An uncapped night has no figure to add, so the run's total says so rather than undercounting.
const leftTotal = computed(() => counted.value.some(one => capacityOf(one) === null)
  ? 'No limit'
  : `${counted.value.reduce((sum, one) => sum + (leftOf(one) ?? 0), 0)}`)
const muted = (value: string): VNode => h('span', { class: 'font-sans text-sm text-muted' }, value)

const columns = computed<TableColumn<AdminPerformance>[]>(() => [
  {
    id: 'when',
    header: 'Performance',
    footer: () => h('span', { class: 'text-sm font-semibold' }, 'The run'),
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'text-sm' }, saysWhen(row.original.startsAt)),
      h('div', { class: 'text-xs text-muted' }, row.original.venueName),
    ]),
  },
  {
    id: 'capacity',
    header: 'Capacity',
    meta: RIGHT_ALIGNED,
    footer: () => figure(`${capacityTotal.value}`),
    cell: ({ row }) => {
      const capacity = capacityOf(row.original)
      if (row.original.externalBookingUrl) return muted('Externally ticketed')
      if (row.original.status === 'CANCELLED') return muted('Cancelled')
      return figure(capacity === null ? 'Uncapped' : `${capacity}`)
    },
  },
  {
    id: 'sold',
    header: 'Sold',
    meta: RIGHT_ALIGNED,
    footer: () => figure(`${soldTotal.value}`),
    cell: ({ row }) => {
      if (row.original.externalBookingUrl) return h('span', { class: 'font-sans text-sm text-muted' }, 'n/a')
      const share = soldShare(row.original.soldTickets, capacityOf(row.original) ?? 0)
      return h('div', { class: 'flex flex-col items-end gap-1' }, [
        figure(`${row.original.soldTickets}`),
        share === null ? null : h(UProgress, { modelValue: share, size: '2xs', class: 'w-20' }),
      ])
    },
  },
  {
    id: 'unpaid',
    header: 'Unpaid',
    meta: RIGHT_ALIGNED,
    footer: () => figure(`${unpaidTotal.value}`),
    cell: ({ row }) => (row.original.externalBookingUrl || row.original.status === 'CANCELLED'
      ? muted('n/a')
      : figure(`${row.original.unpaidTickets}`)),
  },
  {
    id: 'remaining',
    header: 'Left',
    meta: RIGHT_ALIGNED,
    footer: () => figure(leftTotal.value),
    cell: ({ row }) => {
      const left = leftOf(row.original)
      if (row.original.externalBookingUrl || row.original.status === 'CANCELLED') return muted('n/a')
      if (left === null) return h('span', { class: 'font-sans text-sm text-muted' }, 'No limit')
      return figure(`${left}`)
    },
  },
])
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">
        How the run is selling
      </h3>
      <p class="text-sm text-muted">
        Counted from the seats held right now, so a released hold is back in the house here too. Unpaid is what the desk still has to take money for.
      </p>
    </template>

    <UTable
      :data="rows"
      :columns="columns"
      data-test="show-sales"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No performances yet, so there is nothing to sell.
        </p>
      </template>
    </UTable>
  </UCard>
</template>
