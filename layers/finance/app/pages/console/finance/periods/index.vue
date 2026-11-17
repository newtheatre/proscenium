<!-- Periods (Box office specification, part 5): every accounting period, open or closed, with its
     totals. Opening one shows what stops it being closed. -->
<script setup lang="ts">
interface Period { id: string, label: string, startsOn: string, endsOn: string, closed: boolean, debitsMinor: number }

const { t } = useT()
const { money } = await useMoney()
const { data, status, error, refresh } = await useAPI<{ periods: Period[] }>('/api/finance/periods', { key: 'finance:periods' })
const newestFirst = computed(() => [...(data.value?.periods ?? [])].reverse())
const { day: dateOf } = useDates()
</script>

<template>
  <PageFrame :title="t('finance.navigation.periods.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!newestFirst.length"
        :title="t('finance.screens.periods.empty')"
        :description="t('finance.screens.periods.empty-help')"
        icon="i-lucide-calendar-check"
      />
      <RecordList
        v-else
        :label="t('finance.navigation.periods.label')"
      >
        <RecordListItem
          v-for="p in newestFirst"
          :key="p.id"
          :to="`/console/finance/periods/${p.id}`"
          :name="p.label"
          :description="t('finance.screens.periods.range', { from: dateOf(p.startsOn), to: dateOf(p.endsOn) })"
        >
          <span class="text-sm text-muted tabular-nums">{{ t('finance.screens.periods.moved', { amount: money(p.debitsMinor) }) }}</span>
          <StatusBadge
            :tone="p.closed ? 'neutral' : 'success'"
            :label="t(p.closed ? 'finance.screens.periods.closed' : 'finance.screens.periods.open')"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
