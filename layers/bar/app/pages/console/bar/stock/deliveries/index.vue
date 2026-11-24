<!-- Deliveries (S9): drafts first, then the latest received. A row opens the delivery; a draft is
     finished and received there, a received one is its record. A table on a laptop, a list on a phone. -->
<script setup lang="ts">
interface Delivery { id: string, locationId: string, supplier: string | null, supplierRef: string | null, state: 'draft' | 'received', createdBy: string, receivedBy: string | null, receivedAt: number | null, createdAt: number, lines: unknown[] }

const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<{ deliveries: Delivery[], locations: { id: string, name: string }[] }>('/api/bar/stock/deliveries', { key: 'bar:deliveries' })

const locationName = (id: string) => data.value?.locations.find(l => l.id === id)?.name ?? ''
const columns = computed(() => [
  { id: 'when', header: t('bar.screens.deliveries.when') },
  { id: 'location', header: t('bar.screens.deliveries.location') },
  { id: 'supplier', header: t('bar.screens.deliveries.supplier') },
  { id: 'lines', header: t('bar.screens.deliveries.lines') },
  { id: 'state', header: t('bar.screens.deliveries.state') },
])
</script>

<template>
  <PageFrame :title="t('bar.navigation.stock-levels.label')">
    <template #primary>
      <UButton
        to="/console/bar/stock/deliveries/new"
        icon="i-lucide-plus"
        :label="t('bar.screens.deliveries.record')"
      />
    </template>
    <BarStockTabs />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.deliveries.length"
          :title="t('bar.screens.deliveries.empty.title')"
          :description="t('bar.screens.deliveries.empty.description')"
          icon="i-lucide-truck"
          :action="{ label: t('bar.screens.deliveries.record'), icon: 'i-lucide-plus', to: '/console/bar/stock/deliveries/new' }"
        />
        <TableOrList
          v-if="d.deliveries.length"
          :rows="d.deliveries"
          :columns="columns"
          :label="t('bar.screens.deliveries.title')"
          :to="(r: Delivery) => `/console/bar/stock/deliveries/${r.id}`"
        >
          <template #item="{ row: r }">
            <RecordListItem
              :to="`/console/bar/stock/deliveries/${r.id}`"
              :name="[r.supplier ?? t('bar.screens.deliveries.no-supplier'), locationName(r.locationId)].join(' · ')"
              :description="[dateTime(r.receivedAt ?? r.createdAt), r.supplierRef ? t('bar.screens.deliveries.note-ref', { ref: r.supplierRef }) : null, t('bar.screens.deliveries.items-count', { count: r.lines.length })].filter(Boolean).join(' · ')"
            >
              <StatusBadge
                :tone="r.state === 'received' ? 'success' : 'warning'"
                :label="t(`bar.screens.deliveries.states.${r.state}`)"
              />
            </RecordListItem>
          </template>
          <template #when-cell="{ row }">
            <ULink
              :to="`/console/bar/stock/deliveries/${row.original.id}`"
              class="font-medium"
            >
              {{ dateTime(row.original.receivedAt ?? row.original.createdAt) }}
            </ULink>
          </template>
          <template #location-cell="{ row }">
            {{ locationName(row.original.locationId) }}
          </template>
          <template #supplier-cell="{ row }">
            {{ row.original.supplier ?? t('bar.screens.deliveries.no-supplier') }}
            <span
              v-if="row.original.supplierRef"
              class="block text-sm text-muted"
            >{{ t('bar.screens.deliveries.note-ref', { ref: row.original.supplierRef }) }}</span>
          </template>
          <template #lines-cell="{ row }">
            {{ row.original.lines.length }}
          </template>
          <template #state-cell="{ row }">
            <StatusBadge
              :tone="row.original.state === 'received' ? 'success' : 'warning'"
              :label="t(`bar.screens.deliveries.states.${row.original.state}`)"
            />
          </template>
        </TableOrList>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
