<!-- Data requests (Identity Doc part 5; ID-35): every copy and erasure asked for, with its state,
     holds and respond-by date, the nearest deadline first. Open requests are the default view;
     overdue and closed ones are a view away. Each row opens the request. -->
<script setup lang="ts">
import { dataRequestsList } from '../../../../../shared/identity-lists'

definePageMeta({ layout: 'console' })

type State = 'requested' | 'confirmed' | 'held' | 'running' | 'done' | 'cancelled' | 'failed'
interface Row { id: string, accountId: string, person: string, kind: 'export' | 'erasure', state: State, requestedAt: number, respondBy: number, holds: string[], closed: boolean, overdue: boolean }

const { t } = useT()
const { day } = useDates()

const TONES = { requested: 'neutral', confirmed: 'info', held: 'warning', running: 'info', done: 'success', cancelled: 'neutral', failed: 'danger' } as const

const list = computed(() => ({
  ...dataRequestsList,
  filters: {
    kind: { ...dataRequestsList.filters.kind, label: t('core.data-requests.column.kind'), options: dataRequestsList.filters.kind.options.map(o => ({ value: o.value, label: t(`core.data-requests.kind.${o.value}`) })) },
    state: { ...dataRequestsList.filters.state, label: t('core.data-requests.column.state'), options: dataRequestsList.filters.state.options.map(o => ({ value: o.value, label: t(`core.data-requests.state.${o.value}`) })) },
    closed: { ...dataRequestsList.filters.closed, label: t('core.data-requests.filter.closed') },
    overdue: { ...dataRequestsList.filters.overdue, label: t('core.data-requests.filter.overdue') },
  },
  sorts: { respondBy: { ...dataRequestsList.sorts.respondBy, label: t('core.data-requests.column.respondBy') } },
  columns: Object.fromEntries(Object.entries(dataRequestsList.columns).map(([key, c]) => [key, { ...c, label: t(`core.data-requests.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(dataRequestsList.views).map(([key, v]) => [key, { ...v, label: t(`core.data-requests.view.${key}`) }])),
}))
</script>

<template>
  <PageList
    :title="t('core.navigation.data-requests.label')"
    route="/api/core/data-requests"
    :list="list"
    :row-label="(row: Row) => t('core.data-requests.row', { kind: t(`core.data-requests.kind.${row.kind}`), person: row.person })"
    :row-to="(row: Row) => `/console/people/data-requests/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('core.data-requests.empty.title'), description: t('core.data-requests.empty.description'), icon: 'i-lucide-file-lock' }"
  >
    <template #cell-person="{ row }">
      {{ row.person }}
    </template>
    <template #cell-kind="{ row }">
      {{ t(`core.data-requests.kind.${row.kind}`) }}
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="row.closed ? 'neutral' : TONES[row.state as State]"
        :label="row.closed ? t('core.data-requests.state.closed') : t(`core.data-requests.state.${row.state}`)"
      />
    </template>
    <template #cell-requestedAt="{ row }">
      {{ day(row.requestedAt) }}
    </template>
    <template #cell-respondBy="{ row }">
      <span class="inline-flex flex-wrap items-center gap-2">
        {{ day(row.respondBy) }}
        <StatusBadge
          v-if="row.overdue"
          tone="danger"
          :label="t('core.data-requests.overdue')"
        />
      </span>
    </template>
  </PageList>
</template>
