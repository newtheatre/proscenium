<!-- Orders (Box office specification, part 6): every order past the basket, newest first. Reserved
     and paid orders are the default view; search finds a booking reference or a buyer by name or
     address. Each row opens the order. -->
<script setup lang="ts">
import { ordersList } from '../../../../../shared/lists'

definePageMeta({ layout: 'console' })

type State = 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'expired'
interface Row { id: string, reference: string, state: State, channel: string, buyer: string | null, show: string | null, startsAt: number | null, currency: string, totalMinor: number, createdAt: number, complimentary?: boolean }

const { t } = useT()
const { dateTime, day } = useDates()
const { money } = await useMoney()

const TONES = { reserved: 'warning', awaiting_payment: 'info', confirmed: 'success', cancelled: 'neutral', expired: 'neutral' } as const

const list = computed(() => ({
  ...ordersList,
  filters: {
    state: { ...ordersList.filters.state, label: t('box-office.orders.column.state'), options: ordersList.filters.state.options.map(o => ({ value: o.value, label: t(`box-office.orders.state.${o.value}`) })) },
    channel: { ...ordersList.filters.channel, label: t('box-office.orders.filter.channel'), options: ordersList.filters.channel.options.map(o => ({ value: o.value, label: t(`box-office.orders.channel.${o.value}`) })) },
  },
  sorts: { created: { ...ordersList.sorts.created, label: t('box-office.orders.column.created') } },
  columns: Object.fromEntries(Object.entries(ordersList.columns).map(([key, c]) => [key, { ...c, label: t(`box-office.orders.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(ordersList.views).map(([key, v]) => [key, { ...v, label: t(`box-office.orders.view.${key}`) }])),
}))
</script>

<template>
  <PageList
    :title="t('box-office.navigation.orders.label')"
    route="/api/box-office/orders"
    :list="list"
    :row-label="(row: Row) => t('box-office.orders.row', { reference: row.reference })"
    :row-to="(row: Row) => `/console/box-office/orders/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('box-office.orders.empty.title'), description: t('box-office.orders.empty.description'), icon: 'i-lucide-receipt' }"
  >
    <template #cell-reference="{ row }">
      <span class="font-mono">{{ row.reference }}</span>
    </template>
    <template #cell-buyer="{ row }">
      {{ row.buyer ?? t('box-office.orders.no-buyer') }}
    </template>
    <template #cell-show="{ row }">
      <span v-if="row.show && row.startsAt">{{ row.show }}, {{ dateTime(row.startsAt) }}</span>
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as State]"
        :label="t(`box-office.orders.state.${row.state === 'confirmed' && row.complimentary ? 'complimentary' : row.state}`)"
      />
    </template>
    <template #cell-total="{ row }">
      {{ money(row.totalMinor, row.currency) }}
    </template>
    <template #cell-created="{ row }">
      {{ day(row.createdAt) }}
    </template>
  </PageList>
</template>
