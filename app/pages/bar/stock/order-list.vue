<script setup lang="ts">
import { h } from 'vue'
import { saysQuantity } from '#shared/utils/bar'
import { saysToOrder } from '#shared/utils/ordering'
import { NO_STOCK_GROUP } from '#shared/utils/stocktakes'
import type { OrderListRow, UnconfiguredRow } from '#shared/utils/ordering'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Order list', middleware: 'console', docs: '/docs/bar/order-list' })

const request = useRequestFetch()

const { data, status, error, refresh } = await useAsyncData(
  'bar-order-list',
  () => request<{ shortfalls: OrderListRow[], unconfigured: UnconfiguredRow[] }>('/api/admin/bar/order-list'),
  { default: () => ({ shortfalls: [], unconfigured: [] }) },
)

const listingFailure = useListFailure(error, 'The order list could not be read.')

const grouped = computed(() => {
  // Grouped case-insensitively, matching the server's own ordering: free text has no vocabulary
  // to hold two spellings of one category apart from being the same heading.
  const groups = new Map<string, { label: string, rows: OrderListRow[] }>()
  for (const row of data.value.shortfalls) {
    const label = row.category ?? NO_STOCK_GROUP
    const key = label.toLowerCase()
    const held = groups.get(key) ?? { label, rows: [] }
    held.rows.push(row)
    groups.set(key, held)
  }
  return [...groups.values()].map(group => [group.label, group.rows] as const)
})

// A bar with no stock groups gets no heading saying so over its only list.
const onlyUngrouped = computed(() => grouped.value.length === 1 && grouped.value[0]![0] === NO_STOCK_GROUP)

const columns: TableColumn<OrderListRow>[] = [
  {
    id: 'name',
    header: 'Stocked item',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      // Below sm the on hand and par columns are hidden: shown here instead, so a phone keeps the
      // shortfall in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${saysQuantity(row.original.onHand, row.original.unit)} on hand, par ${saysQuantity(row.original.parQty, row.original.unit)}, short ${saysQuantity(row.original.shortfall, row.original.unit)}`),
    ]),
  },
  {
    id: 'onHand',
    header: 'On hand',
    meta: RIGHT_ALIGNED_HIDE_BELOW_SM,
    cell: ({ row }) => saysQuantity(row.original.onHand, row.original.unit),
  },
  {
    id: 'par',
    header: 'Par',
    meta: RIGHT_ALIGNED_HIDE_BELOW_SM,
    cell: ({ row }) => saysQuantity(row.original.parQty, row.original.unit),
  },
  {
    id: 'shortfall',
    header: 'Shortfall',
    meta: RIGHT_ALIGNED_HIDE_BELOW_SM,
    cell: ({ row }) => saysQuantity(row.original.shortfall, row.original.unit),
  },
  {
    id: 'toOrder',
    header: 'To order',
    // The one figure a supplier order needs: whole containers, rounded up (0140).
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => h('span', { 'class': 'font-medium', 'data-test': `to-order-${row.original.id}` }, saysToOrder(row.original)),
  },
]
</script>

<template>
  <ReadGate
    :failure="listingFailure"
    class="space-y-6"
    @retry="refresh"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-muted">
        What is short against its par level, grouped for a supplier.
      </p>
      <UButton
        data-test="export-order-list"
        color="neutral"
        variant="subtle"
        icon="i-lucide-download"
        to="/api/admin/bar/order-list/export"
        external
        target="_blank"
      >
        Export CSV
      </UButton>
    </div>

    <p
      v-if="status !== 'pending' && data.shortfalls.length === 0"
      class="text-sm text-muted"
      data-test="no-shortfalls"
    >
      Nothing is short against its par level.
    </p>

    <div
      v-for="[category, rows] in grouped"
      :key="category"
      class="space-y-2"
      data-test="order-list-group"
    >
      <h3
        v-if="!onlyUngrouped"
        class="font-semibold"
      >
        {{ category }}
      </h3>
      <!-- Never reached: a group exists only because grouped (above) put a row in it. Said
      anyway, so the convention every table states its empty case (0032) holds if that changes. -->
      <UTable
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            Nothing here.
          </p>
        </template>
      </UTable>
    </div>

    <div
      v-if="data.unconfigured.length > 0"
      data-test="unconfigured-items"
    >
      <h3 class="font-semibold">
        No par level set
      </h3>
      <p class="mb-2 text-sm text-muted">
        {{ plural(data.unconfigured.length, 'item') }} excluded from the list above until given one.
      </p>
      <ul class="list-inside list-disc text-sm">
        <li
          v-for="row in data.unconfigured"
          :key="row.id"
        >
          <NuxtLink
            :to="`/bar/stock?search=${encodeURIComponent(row.name)}`"
            class="underline"
            :data-test="`unconfigured-${row.id}`"
          >
            {{ row.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </ReadGate>
</template>
