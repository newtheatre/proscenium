<!-- Performances (Box office specification, part 6): those still to come, soonest first, with their
     sale state and how many seats are taken. Each opens its sales set-up. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

type Sales = 'draft' | 'on_sale' | 'paused' | 'closed'
interface Row { id: string, title: string, label: string | null, startsAt: number, scheduled: boolean, sales: Sales | null, capacity: number, taken: number }

const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<{ performances: Row[] }>('/api/box-office/performances', { key: 'box-office:performances' })

// A search that opens from its icon, by title or label.
const search = ref('')
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.performances ?? []).filter(p => !words || `${p.title} ${p.label ?? ''}`.toLowerCase().includes(words))
})

const TONES = { draft: 'neutral', on_sale: 'success', paused: 'warning', closed: 'neutral' } as const
const badge = (row: Row) => !row.scheduled
  ? { tone: 'neutral' as const, label: t('box-office.performances.not-scheduled') }
  : row.sales
    ? { tone: TONES[row.sales], label: t(`box-office.performances.sales.${row.sales}`) }
    : { tone: 'neutral' as const, label: t('box-office.performances.not-set-up') }
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
        <RecordList
          v-else
          :label="t('box-office.navigation.performances.label')"
        >
          <RecordListItem
            v-for="row in matching"
            :key="row.id"
            :to="`/console/box-office/performances/${encodeURIComponent(row.id)}`"
            :name="row.label ? `${row.title}, ${row.label}` : row.title"
            :description="row.capacity ? t('box-office.performances.taken', { taken: row.taken, capacity: row.capacity, when: dateTime(row.startsAt) }) : dateTime(row.startsAt)"
          >
            <StatusBadge
              :tone="badge(row).tone"
              :label="badge(row).label"
            />
          </RecordListItem>
        </RecordList>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
