<!-- A report, ready-made (REP-04) or saved (REP-12): choose the record, the dates and the breakdown;
     its figures are read live, headline totals first, then a chart where one helps, then the table,
     pivoted across the top where the report says so. A figure the reader may not see is counted, never nought. -->
<script setup lang="ts">
import type { PeriodRule, ReportColumn, ReportView } from '../../../../../shared/reports'
import { cellKey } from '../../../../../shared/table'

definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const query = computed(() => Object.fromEntries(['scope', 'period', 'from', 'to'].map(k => [k, route.query[k]]).filter(([, v]) => typeof v === 'string' && v)))
const { data: view, status, error, refresh } = await useAPI<ReportView>(() => `/api/reports/definitions/${id.value}`, { query, key: `reports:definition:${id.value}` })
const { words, keyName } = useReportWords()

const set = (changes: Record<string, string | undefined>) => router.replace({ query: { ...route.query, ...changes } })
const scopeId = computed({
  get: () => view.value?.scope.id ?? null,
  set: value => set({ scope: value ? `${view.value!.scopeKind}:${value}` : undefined }),
})
const period = computed<PeriodRule>({
  get: () => view.value?.period.rule ?? 'scope',
  set: rule => set({ period: rule, ...(rule === 'chosen' ? { from: view.value?.period.from, to: view.value?.period.to } : { from: undefined, to: undefined }) }),
})
const dates = computed({
  get: () => ({ start: view.value?.period.from ?? '', end: view.value?.period.to ?? '' }),
  set: ({ start, end }) => { if (start && end) set({ from: start, to: end }) },
})
const chosenBy = computed<string>({
  get: () => {
    const asked = route.query.by as string | undefined
    if (asked === 'none' || (asked && view.value?.breakdowns.includes(asked))) return asked
    const usual = view.value?.usualBy
    return usual && view.value?.breakdowns.includes(usual) ? usual : 'none'
  },
  set: value => set({ by: value }),
})
const by = computed(() => chosenBy.value === 'none' ? undefined : chosenBy.value)

const people = computed(() => view.value?.kind === 'people')
const { ready, table, status: reading, error: readError, refresh: reread } = useReportFigures(computed(() => people.value ? null : view.value), by)
const { text } = useFigureText()
const { keep, download } = useReportCopy(view, by)
const { archive } = useReportArchive()
const actions = computed(() => {
  const v = view.value
  if (!v) return []
  return [
    ...(ready.value || (people.value && (v.scopeKind === 'none' || v.scope.id))
      ? [
          { label: t('reports.copy.keep'), icon: 'i-lucide-copy-plus', onSelect: keep },
          ...(!people.value || v.mayExport ? [{ label: t('reports.copy.download'), icon: 'i-lucide-download', lesser: true, onSelect: download }] : []),
        ]
      : []),
    ...(v.saved?.editable ? [{ label: t('reports.edit'), icon: 'i-lucide-pencil', lesser: true, to: `/console/reports/${v.id}/edit` }] : []),
    ...(v.source === 'ready-made' && v.mayCreate ? [{ label: t('reports.save-copy'), icon: 'i-lucide-save', lesser: true, to: `/console/reports/new?from=${v.id}` }] : []),
  ]
})
const menu = computed(() => view.value?.saved?.editable && !view.value.saved.archived
  ? [{ label: t('reports.archive'), icon: 'i-lucide-archive', onSelect: () => archive(view.value!.id, words(view.value!.name), () => navigateTo('/console/reports')) }]
  : [])

const title = computed(() => view.value ? words(view.value.name) : t('reports.title'))
const questionText = useQuestionText()
const question = computed(() => {
  const v = view.value
  return v ? questionText(v.scope.title, v.period.from, v.period.to, by.value ? keyName(by.value, v.keyLabels) : undefined, v.acrossBy ? keyName(v.acrossBy, v.keyLabels) : undefined) : ''
})
const filterChip = computed(() => {
  const f = view.value?.filter
  return f ? `${keyName(f.key, view.value!.keyLabels)}: ${f.values.map(v => f.labels[v] ?? v).join(', ')}` : null
})

const label = (c: ReportColumn) => c.kind === 'formula' ? c.label : t(c.label)
const shown = computed(() => (table.value?.columns ?? []).map((c, i) => ({ c, i })).filter(({ c }) => c.shown))
const facts = computed(() => shown.value.map(({ c, i }) => ({ label: label(c), value: text(c.unit, table.value!.totals[cellKey(i, null)]).text })))
const gone = computed(() => (view.value?.columns ?? []).filter(c => c.kind === 'figure' && c.gone).length)
const hidden = computed(() => Math.max(0, (table.value?.hidden ?? 0) - gone.value))

// One chart, of the first column that counts something, where it helps: over time, or a few rows.
const charted = computed(() => shown.value.find(({ c }) => c.unit === 'count') ?? shown.value[0])
const chartRows = computed(() => {
  const rows = table.value?.rows ?? []
  const col = charted.value
  if (!col || !by.value || view.value?.acrossBy || rows.length < 2 || (rows.length > 20 && by.value !== 'day' && by.value !== 'month')) return [] // not-policy: rule from the screens tab, at most 20 bars
  return rows.map((r) => {
    const cell = r.cells[cellKey(col.i, null)]
    return { name: r.label, value: cell?.state === 'ok' ? cell.amounts.reduce((s, a) => s + a.value, 0) : 0 }
  })
})
const chartSummary = computed(() => {
  const most = [...chartRows.value].sort((a, b) => b.value - a.value)[0]
  return most && charted.value ? t('reports.chart-summary', { figure: label(charted.value.c).toLowerCase(), most: most.name }) : ''
})
</script>

<template>
  <PageFrame
    :title="title"
    :description="view ? words(view.description) || undefined : undefined"
    :trail="[{ label: t('reports.title'), to: '/console/reports' }]"
  >
    <template
      v-if="view?.saved?.archived"
      #status
    >
      <UBadge
        :label="t('reports.archived')"
        color="neutral"
        variant="subtle"
      />
    </template>
    <template
      v-if="actions.length || menu.length"
      #primary
    >
      <PageActions
        :actions="actions"
        :menu="menu"
      />
    </template>
    <DataBoundary
      :data="view"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-8">
          <ReportControls
            v-model:scope-id="scopeId"
            v-model:period="period"
            v-model:dates="dates"
            v-model:by="chosenBy"
            :view="loaded"
          />
          <template v-if="loaded.kind === 'people'">
            <UAlert
              icon="i-lucide-eye"
              color="warning"
              variant="subtle"
              :title="t('reports.people.banner')"
            />
            <EmptyState
              v-if="loaded.scopeKind !== 'none' && !loaded.scope.id"
              :title="t(`reports.choose.${loaded.scopeKind}`)"
              :description="t('reports.choose-description')"
              icon="i-lucide-mouse-pointer-click"
            />
            <ReportPeople
              v-else
              :view="loaded"
              :by="by"
              :question="question"
            />
          </template>
          <EmptyState
            v-else-if="!ready"
            :title="t(`reports.choose.${loaded.scopeKind}`)"
            :description="t('reports.choose-description')"
            icon="i-lucide-mouse-pointer-click"
          />
          <DataBoundary
            v-else
            :data="table"
            :status="reading"
            :error="readError"
            @retry="reread()"
          >
            <template #default="{ data: laid }">
              <div class="space-y-8">
                <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{{ question }}</span>
                  <UBadge
                    v-if="filterChip"
                    :label="filterChip"
                    icon="i-lucide-filter"
                    color="neutral"
                    variant="outline"
                  />
                </div>
                <FactStrip
                  :facts="facts"
                  framed
                />
                <ChartFigure
                  v-if="chartRows.length && charted"
                  :title="label(charted.c)"
                  :summary="chartSummary"
                  :data="chartRows"
                  index="name"
                  :categories="[{ key: 'value', label: label(charted.c) }]"
                />
                <ReportTable
                  v-if="by && laid.rows.length"
                  :table="laid"
                  :by-label="keyName(by, loaded.keyLabels)"
                  :caption="question"
                />
                <p
                  v-else-if="by"
                  class="text-sm text-muted"
                >
                  {{ t('reports.nothing') }}
                </p>
                <p
                  v-if="hidden > 0"
                  class="text-sm text-muted"
                >
                  {{ t('reports.hidden', { count: hidden }) }}
                </p>
                <p
                  v-if="gone"
                  class="text-sm text-muted"
                >
                  {{ t('reports.gone', { count: gone }) }}
                </p>
              </div>
            </template>
          </DataBoundary>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
