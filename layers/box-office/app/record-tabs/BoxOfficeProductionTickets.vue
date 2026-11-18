<!-- The Tickets tab on a production's page (core.record-tab; show walkthrough, decision 1): how the
     run is selling, a warning when performances are on sale while the production is still in draft,
     and each performance with where its sales stand, opening its set-up. -->
<script setup lang="ts">
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useProductionTickets(() => props.recordId)

// On sale (or paused, so still bookable once put back) while buyers cannot find the production.
const sellingUnpublished = computed(() => !!data.value && data.value.production.state !== 'published'
  && data.value.performances.filter(p => p.sales === 'on_sale' || p.sales === 'paused').length)
const facts = computed(() => {
  const totals = data.value?.totals
  if (!totals) return []
  return [
    { label: t('box-office.production-tickets.performances'), value: totals.performances },
    { label: t('box-office.production-tickets.on-sale'), value: totals.onSale },
    { label: t('box-office.production-tickets.taken'), value: totals.capacity ? t('box-office.production-tickets.seats', { taken: totals.taken, capacity: totals.capacity }) : '0' },
  ]
})
const badge = (row: ProductionTicketsRow) => !row.scheduled && !row.past
  ? { tone: 'neutral' as const, label: t('box-office.performances.not-scheduled') }
  : saleStateBadge(row.sales, row.capacity, t)
const when = (row: ProductionTicketsRow) => row.label ? `${dateTime(row.startsAt)}, ${row.label}` : dateTime(row.startsAt)
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <div
      v-if="data"
      class="space-y-4"
    >
      <UAlert
        v-if="sellingUnpublished"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="t('box-office.production-tickets.draft-on-sale.title', { count: sellingUnpublished })"
        :description="t('box-office.production-tickets.draft-on-sale.description')"
      />
      <EmptyState
        v-if="!data.performances.length"
        :title="t('box-office.production-tickets.empty.title')"
        :description="t('box-office.production-tickets.empty.description')"
        icon="i-lucide-ticket"
      />
      <template v-else>
        <FactStrip
          :facts="facts"
          framed
        />
        <RecordList :label="t('box-office.record-tabs.production.label')">
          <RecordListItem
            v-for="row in data.performances"
            :key="row.id"
            :to="`/console/box-office/performances/${encodeURIComponent(row.id)}`"
            :name="when(row)"
            :description="row.capacity ? t('box-office.production-tickets.seats', { taken: row.taken, capacity: row.capacity }) : undefined"
            :muted="row.past"
          >
            <StatusBadge
              :tone="badge(row).tone"
              :label="badge(row).label"
            />
          </RecordListItem>
        </RecordList>
      </template>
    </div>
  </DataBoundary>
</template>
