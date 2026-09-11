<script setup lang="ts">
import { h } from 'vue'
import { formatLondon } from '#shared/utils/london'
import type { TableColumn } from '@nuxt/ui'
import type { VNode } from 'vue'
import type { AdminPerformance } from '#shared/utils/programme'

// How the run is selling, performance by performance. Seven rows of magnitude are a table, not a
// chart, and an externally ticketed performance has no house figure of ours to report (D-122).

const props = defineProps<{ performances: AdminPerformance[] }>()

const capacityOf = (one: AdminPerformance): number | null =>
  (one.externalBookingUrl ? null : one.capacityOverride ?? one.venueCapacity)

const rows = computed(() => props.performances)

const figure = (value: string): VNode => h('span', { class: 'font-mono text-sm' }, value)

const soldTotal = computed(() => rows.value.reduce((sum, one) => sum + (one.externalBookingUrl ? 0 : one.soldTickets), 0))
const capacityTotal = computed(() => rows.value.reduce((sum, one) => sum + (capacityOf(one) ?? 0), 0))

const columns = computed<TableColumn<AdminPerformance>[]>(() => [
  {
    id: 'when',
    header: 'Performance',
    footer: () => h('span', { class: 'text-sm font-semibold' }, 'The run'),
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'text-sm' }, formatLondon(new Date(row.original.startsAt * 1000), { dateStyle: 'medium', timeStyle: 'short' })),
      h('div', { class: 'text-xs text-muted' }, row.original.venueName),
    ]),
  },
  {
    id: 'capacity',
    header: 'Capacity',
    meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } },
    footer: () => figure(`${capacityTotal.value}`),
    cell: ({ row }) => {
      const capacity = capacityOf(row.original)
      if (row.original.externalBookingUrl) return h('span', { class: 'text-sm text-muted' }, 'Externally ticketed')
      return figure(capacity === null ? 'Uncapped' : `${capacity}`)
    },
  },
  {
    id: 'sold',
    header: 'Sold',
    meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } },
    footer: () => figure(`${soldTotal.value}`),
    cell: ({ row }) => (row.original.externalBookingUrl
      ? h('span', { class: 'text-sm text-muted' }, 'n/a')
      : figure(`${row.original.soldTickets}`)),
  },
  {
    id: 'remaining',
    header: 'Left',
    meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => {
      const capacity = capacityOf(row.original)
      if (row.original.externalBookingUrl) return h('span', { class: 'text-sm text-muted' }, 'n/a')
      if (capacity === null) return h('span', { class: 'text-sm text-muted' }, 'No limit')
      return figure(`${Math.max(capacity - row.original.soldTickets, 0)}`)
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
        Counted from the seats held right now, so a released hold is back in the house here too.
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
