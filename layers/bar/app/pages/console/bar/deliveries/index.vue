<!-- Deliveries (S9): drafts first, then the latest received. A row opens the delivery; a draft is
     finished and received there, a received one is its record. -->
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
  <PageFrame :title="t('bar.navigation.deliveries.label')">
    <template #primary>
      <UButton
        to="/console/bar/deliveries/new"
        icon="i-lucide-plus"
        :label="t('bar.screens.deliveries.record')"
      />
    </template>
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
        />
        <UTable
          v-else
          :data="d.deliveries"
          :columns="columns"
          :caption="t('bar.navigation.deliveries.label')"
        >
          <template #when-cell="{ row }">
            <ULink
              :to="`/console/bar/deliveries/${row.original.id}`"
              class="font-medium"
            >
              {{ dateTime(row.original.receivedAt ?? row.original.createdAt) }}
            </ULink>
          </template>
          <template #location-cell="{ row }">
            {{ locationName(row.original.locationId) }}
          </template>
          <template #supplier-cell="{ row }">
            {{ [row.original.supplier, row.original.supplierRef].filter(Boolean).join(' · ') || t('bar.screens.deliveries.no-supplier') }}
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
        </UTable>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
