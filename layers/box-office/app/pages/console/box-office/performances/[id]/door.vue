<!-- The door list for one performance (BO-40): who is coming, found by name or booking reference,
     with how many of their tickets are used. Those still to arrive are the default view. Each row
     opens the order. -->
<script setup lang="ts">
import { doorList } from '../../../../../../shared/lists'

definePageMeta({ layout: 'console' })

interface Row { id: string, reference: string, buyer: string | null, tickets: number, admitted: number }

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))

const list = computed(() => ({
  ...doorList,
  filters: { arrived: { ...doorList.filters.arrived, label: t('box-office.door.filter.arrived') } },
  sorts: { reference: { ...doorList.sorts.reference, label: t('box-office.door.column.reference') } },
  columns: Object.fromEntries(Object.entries(doorList.columns).map(([key, c]) => [key, { ...c, label: t(`box-office.door.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(doorList.views).map(([key, v]) => [key, { ...v, label: t(`box-office.door.view.${key}`) }])),
}))
const trail = computed(() => [
  { label: t('box-office.navigation.performances.label'), to: '/console/box-office/performances' },
  { label: t('box-office.door.set-up'), to: `/console/box-office/performances/${encodeURIComponent(id.value)}` },
])
</script>

<template>
  <PageList
    :title="t('box-office.door.title')"
    :trail="trail"
    :route="`/api/box-office/performances/${encodeURIComponent(id)}/door`"
    :list="list"
    :row-label="(row: Row) => t('box-office.orders.row', { reference: row.reference })"
    :row-to="(row: Row) => `/console/box-office/orders/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('box-office.door.empty.title'), description: t('box-office.door.empty.description'), icon: 'i-lucide-door-open' }"
  >
    <template #cell-buyer="{ row }">
      {{ row.buyer ?? t('box-office.orders.no-buyer') }}
    </template>
    <template #cell-reference="{ row }">
      <span class="font-mono">{{ row.reference }}</span>
    </template>
    <template #cell-admitted="{ row }">
      <StatusBadge
        :tone="row.admitted === row.tickets ? 'success' : row.admitted ? 'warning' : 'neutral'"
        :label="t('box-office.door.admitted', { admitted: row.admitted, tickets: row.tickets })"
      />
    </template>
  </PageList>
</template>
