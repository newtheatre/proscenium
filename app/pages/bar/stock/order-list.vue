<script setup lang="ts">
import { h } from 'vue'
import { saysQuantity } from '#shared/utils/bar'
import type { OrderListRow, UnconfiguredRow } from '#shared/utils/ordering'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Order list', middleware: 'console', docs: '/docs/bar/order-list' })

const request = useRequestFetch()

const { data, status, error } = await useAsyncData(
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
    const label = row.category ?? 'Uncategorised'
    const key = label.toLowerCase()
    const held = groups.get(key) ?? { label, rows: [] }
    held.rows.push(row)
    groups.set(key, held)
  }
  return [...groups.values()].map(group => [group.label, group.rows] as const)
})

const columns: TableColumn<OrderListRow>[] = [
  {
    id: 'name',
    header: 'Stocked item',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      // Below sm the on hand and par columns are hidden: shown here instead, so a phone keeps the
      // shortfall in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${saysQuantity(row.original.onHand, row.original.unit)} on hand, par ${saysQuantity(row.original.parQty, row.original.unit)}`),
    ]),
  },
  {
    id: 'onHand',
    header: 'On hand',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } },
    cell: ({ row }) => saysQuantity(row.original.onHand, row.original.unit),
  },
  {
    id: 'par',
    header: 'Par',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } },
    cell: ({ row }) => saysQuantity(row.original.parQty, row.original.unit),
  },
  {
    id: 'shortfall',
    header: 'Shortfall',
    // The one figure a supplier order actually needs, weighted against On hand and Par beside it.
    meta: { class: { td: 'text-right whitespace-nowrap font-medium' } },
    cell: ({ row }) => saysQuantity(row.original.shortfall, row.original.unit),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure.message"
      :actions="listingFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listingFailure.enrolPath, color: 'error' }] : []"
    />

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
      <h3 class="font-semibold">
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
  </div>
</template>
