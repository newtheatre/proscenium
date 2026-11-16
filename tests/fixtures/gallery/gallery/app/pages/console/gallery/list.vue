<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Item { id: string, name: string, status: string, seats: number }
const columns = [
  { key: 'name', label: 'Production', sortable: true, card: true },
  { key: 'status', label: 'Status', card: true },
  { key: 'seats', label: 'Seats', sortable: true, sortType: 'number', card: true },
]
const filters = [{
  name: 'status',
  label: 'Status',
  primary: true,
  options: [{ value: 'draft', label: 'Draft' }, { value: 'on-sale', label: 'On sale' }, { value: 'sold-out', label: 'Sold out' }],
}]
const tones = { 'draft': 'neutral', 'on-sale': 'success', 'sold-out': 'warning' } as const
const words = { 'draft': 'Draft', 'on-sale': 'On sale', 'sold-out': 'Sold out' } as const
const rowActions = (row: Item) => [[{ label: 'Open', icon: 'i-lucide-eye', to: `/console/gallery/list?open=${row.id}` }]]
</script>

<template>
  <PageList
    title="Sample list"
    route="/api/gallery/items"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Item) => row.name"
    :row-to="(row: Item) => `/console/gallery/list?open=${row.id}`"
    :row-actions="rowActions"
    :bulk-actions="[{ label: 'Archive', icon: 'i-lucide-archive', run: () => {} }]"
    export-route="/api/gallery/items"
    can-export
    :export-ceiling="100"
    :empty="{ title: 'No productions yet', description: 'Productions you add will be listed here.', icon: 'i-lucide-drama' }"
  >
    <template #primary>
      <UButton
        label="Add production"
        icon="i-lucide-plus"
      />
    </template>
    <template #cell-status="{ row }">
      <StatusBadge
        :tone="tones[row.status as keyof typeof tones]"
        :label="words[row.status as keyof typeof words]"
      />
    </template>
  </PageList>
</template>
