<!-- Incidents (Front of house specification, part 5, "Console"): number, date, kind, severity,
     state and venue. The default view is those awaiting review. Nothing written about what happened,
     and nobody's name, is in the list. -->
<script setup lang="ts">
import { incidentsList } from '../../../../../shared/lists'

interface Row {
  id: string
  reference: string
  kind: 'incident' | 'near_miss'
  severity: 'minor' | 'moderate' | 'serious'
  state: 'reported' | 'in_review' | 'closed'
  occurred: number
  venue: string | null
  actions: number
}

const { t } = useT()
const { dateTime } = useDates()
const { data: choices } = await useAPI<{ venues: { id: string, name: string }[] }>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

const SEVERITY = { minor: 'neutral', moderate: 'warning', serious: 'danger' } as const
const STATE = { reported: 'warning', in_review: 'info', closed: 'neutral' } as const
const filters = incidentsList.filters
const list = computed(() => ({
  ...incidentsList,
  filters: {
    state: { ...filters.state, label: t('front-of-house.incidents.column.state'), options: filters.state.options.map(o => ({ value: o.value, label: t(`front-of-house.incident-states.${o.value}`) })) },
    severity: { ...filters.severity, label: t('front-of-house.incidents.column.severity'), options: filters.severity.options.map(o => ({ value: o.value, label: t(`front-of-house.severities.${o.value}`) })) },
    kind: { ...filters.kind, label: t('front-of-house.incidents.column.kind'), options: filters.kind.options.map(o => ({ value: o.value, label: t(`front-of-house.incident-kinds.${o.value}`) })) },
    venue: { ...filters.venue, label: t('front-of-house.incidents.column.venue') },
    occurred: { ...filters.occurred, label: t('front-of-house.incidents.column.occurred'), presets: filters.occurred.presets.map(o => ({ value: o.value, label: t(`front-of-house.incidents.preset.${o.value}`) })) },
  },
  sorts: { number: { ...incidentsList.sorts.number, label: t('front-of-house.incidents.column.reference') } },
  columns: Object.fromEntries(Object.entries(incidentsList.columns).map(([key, c]) => [key, { ...c, label: t(`front-of-house.incidents.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(incidentsList.views).map(([key, v]) => [key, { ...v, label: t(`front-of-house.incidents.view.${key}`) }])),
}))
const filterOptions = computed(() => ({ venue: (choices.value?.venues ?? []).map(v => ({ value: v.id, label: v.name })) }))
</script>

<template>
  <PageList
    :title="t('front-of-house.navigation.incidents.label')"
    route="/api/front-of-house/incidents"
    :list="list"
    :filter-options="filterOptions"
    :row-label="(row: Row) => t('front-of-house.incidents.row', { reference: row.reference })"
    :row-to="(row: Row) => `/console/front-of-house/incidents/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('front-of-house.incidents.empty.title'), description: t('front-of-house.incidents.empty.description'), icon: 'i-lucide-shield-alert' }"
  >
    <template #cell-reference="{ row }">
      <span class="font-mono">{{ row.reference }}</span>
    </template>
    <template #cell-occurred="{ row }">
      {{ dateTime(row.occurred) }}
    </template>
    <template #cell-kind="{ row }">
      {{ t(`front-of-house.incident-kinds.${row.kind}`) }}
    </template>
    <template #cell-severity="{ row }">
      <StatusBadge
        :tone="SEVERITY[row.severity as Row['severity']]"
        :label="t(`front-of-house.severities.${row.severity}`)"
      />
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="STATE[row.state as Row['state']]"
        :label="t(`front-of-house.incident-states.${row.state}`)"
      />
    </template>
  </PageList>
</template>
