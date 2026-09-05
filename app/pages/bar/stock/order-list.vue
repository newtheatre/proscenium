<script setup lang="ts">
import { saysQuantity } from '#shared/utils/bar'
import type { OrderListRow, UnconfiguredRow } from '#shared/utils/ordering'

definePageMeta({ layout: 'console', title: 'Order list', middleware: 'console' })

const request = useRequestFetch()

const { data, status, error } = await useAsyncData(
  'bar-order-list',
  () => request<{ shortfalls: OrderListRow[], unconfigured: UnconfiguredRow[] }>('/api/admin/bar/order-list'),
  { default: () => ({ shortfalls: [], unconfigured: [] }) },
)

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The order list could not be read.') : null))

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
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure"
    />

    <div class="flex items-center justify-between gap-3">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-truck"
        title="Advisory only"
        description="This list is a comparison, not an order: nothing here places one."
        class="flex-1"
      />
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
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left text-muted">
            <th class="py-2">
              Stocked item
            </th>
            <th class="py-2">
              On hand
            </th>
            <th class="py-2">
              Par
            </th>
            <th class="py-2">
              Shortfall
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="border-b last:border-0"
          >
            <td class="py-2">
              {{ row.name }}
            </td>
            <td class="py-2">
              {{ saysQuantity(row.onHand, row.unit) }}
            </td>
            <td class="py-2">
              {{ saysQuantity(row.parQty, row.unit) }}
            </td>
            <td class="py-2 font-medium">
              {{ saysQuantity(row.shortfall, row.unit) }}
            </td>
          </tr>
        </tbody>
      </table>
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
          {{ row.name }}
        </li>
      </ul>
    </div>
  </div>
</template>
