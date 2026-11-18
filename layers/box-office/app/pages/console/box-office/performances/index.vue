<!-- Performances (Box office specification, part 6): those still to come, grouped by production, the
     production with the soonest performance first and each production's soonest first, with their
     sale state and how many seats are taken. Each opens its sales set-up. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Row { id: string, productionId: string, title: string, label: string | null, startsAt: number, scheduled: boolean, sales: SaleState | null, capacity: number, taken: number }

const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<{ performances: Row[] }>('/api/box-office/performances', { key: 'box-office:performances' })
// A set-up changed a moment ago shows here on coming back, not what the list said before.
onMounted(() => { if (data.value) void refresh() })

// A search that opens from its icon, by title or label.
const search = ref('')
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.performances ?? []).filter(p => !words || `${p.title} ${p.label ?? ''}`.toLowerCase().includes(words))
})
// One group a production, in the order its first performance comes.
const groups = computed(() => {
  const byProduction = new Map<string, { id: string, title: string, rows: Row[] }>()
  for (const row of matching.value) {
    const group = byProduction.get(row.productionId) ?? { id: row.productionId, title: row.title, rows: [] }
    group.rows.push(row)
    byProduction.set(row.productionId, group)
  }
  return [...byProduction.values()]
})

const badge = (row: Row) => !row.scheduled
  ? { tone: 'neutral' as const, label: t('box-office.performances.not-scheduled') }
  : saleStateBadge(row.sales, row.capacity, t)
const when = (row: Row) => row.label ? `${dateTime(row.startsAt)}, ${row.label}` : dateTime(row.startsAt)
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.performances.label')"
    :description="t('box-office.performances.description')"
  >
    <template #primary>
      <SearchToggle
        v-if="(data?.performances.length ?? 0) > 1"
        v-model="search"
        :label="t('box-office.performances.search')"
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
          v-if="!d.performances.length"
          :title="t('box-office.performances.empty.title')"
          :description="t('box-office.performances.empty.description')"
          icon="i-lucide-calendar"
        />
        <p
          v-else-if="!matching.length"
          class="text-sm text-muted"
        >
          {{ t('box-office.performances.no-match', { words: search.trim() }) }}
        </p>
        <div
          v-else
          class="space-y-6"
        >
          <section
            v-for="group in groups"
            :key="group.id"
            :aria-labelledby="`production-${group.id}`"
          >
            <h2
              :id="`production-${group.id}`"
              class="mb-2 text-sm font-semibold text-highlighted"
            >
              {{ group.title }}
            </h2>
            <RecordList :label="group.title">
              <RecordListItem
                v-for="row in group.rows"
                :key="row.id"
                :to="`/console/box-office/performances/${encodeURIComponent(row.id)}`"
                :name="when(row)"
                :description="row.capacity ? t('box-office.performances.taken', { taken: row.taken, capacity: row.capacity }) : undefined"
              >
                <StatusBadge
                  :tone="badge(row).tone"
                  :label="badge(row).label"
                />
              </RecordListItem>
            </RecordList>
          </section>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
