<!-- A ready-made report (REP-04): choose the production, the dates and the breakdown; its figures are
     read live and in parallel, headline totals first, then a chart where one helps, then the table.
     Nothing is written. A figure the person may not see is left out and counted, never shown as nought. -->
<script setup lang="ts">
import type { PageBreakdown, PeriodRule, ReportView } from '../../../../shared/reports'

definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const query = computed(() => Object.fromEntries(['scope', 'period', 'from', 'to'].map(k => [k, route.query[k]]).filter(([, v]) => typeof v === 'string' && v)))
const { data: view, status, error, refresh } = await useAPI<ReportView>(() => `/api/reports/definitions/${id.value}`, { query, key: `reports:definition:${id.value}` })

const set = (changes: Record<string, string | undefined>) => router.replace({ query: { ...route.query, ...changes } })
const scopeId = computed({
  get: () => view.value?.scope.id ?? null,
  set: value => set({ scope: value ? `${view.value!.report.scope}:${value}` : undefined }),
})
const period = computed<PeriodRule>({
  get: () => view.value?.period.rule ?? 'scope',
  set: rule => set({ period: rule, ...(rule === 'chosen' ? { from: view.value?.period.from, to: view.value?.period.to } : { from: undefined, to: undefined }) }),
})
const dates = computed({
  get: () => ({ start: view.value?.period.from ?? '', end: view.value?.period.to ?? '' }),
  set: ({ start, end }) => { if (start && end) set({ from: start, to: end }) },
})
const chosenBy = computed<PageBreakdown | 'none'>({
  get: () => {
    const asked = route.query.by as PageBreakdown | 'none' | undefined
    if (asked === 'none' || (asked && view.value?.breakdowns.includes(asked))) return asked
    const usual = view.value?.report.breakdown as PageBreakdown | undefined
    return usual && view.value?.breakdowns.includes(usual) ? usual : 'none'
  },
  set: value => set({ by: value }),
})
const by = computed(() => chosenBy.value === 'none' ? undefined : chosenBy.value)

const { ready, visible, hidden, totals, rows, status: reading, error: readError, refresh: reread } = useReportFigures(view, by)
const { text } = useFigureText()
const { range } = useDates()

const title = computed(() => view.value ? t(view.value.report.label) : t('reports.title'))
const question = computed(() => view.value
  ? [view.value.scope.title, range(view.value.period.from, view.value.period.to), by.value ? t('reports.by-sentence', { by: t(`reports.by.${by.value}`).toLowerCase() }) : null].filter(Boolean).join(', ')
  : '')
const facts = computed(() => visible.value.map(f => ({ label: t(f.label), value: text(f.unit, totals.value[f.id]).text })))

// One chart, of the first figure that counts something, where it helps: over time, or a few rows.
const charted = computed(() => visible.value.find(f => f.unit === 'count') ?? visible.value[0])
const chartRows = computed(() => {
  const figure = charted.value
  if (!figure || !by.value || rows.value.length < 2 || (rows.value.length > 20 && by.value !== 'day' && by.value !== 'month')) return [] // not-policy: rule from the screens tab, at most 20 bars
  return rows.value.map((r) => {
    const cell = r.cells[figure.id]
    return { name: r.label, value: cell?.state === 'ok' ? cell.amounts.reduce((s, a) => s + a.value, 0) : 0 }
  })
})
const chartSummary = computed(() => {
  const most = [...chartRows.value].sort((a, b) => b.value - a.value)[0]
  return most && charted.value ? t('reports.chart-summary', { figure: t(charted.value.label).toLowerCase(), most: most.name }) : ''
})
</script>

<template>
  <PageFrame
    :title="title"
    :description="view ? t(view.report.description) : undefined"
    :trail="[{ label: t('reports.title'), to: '/console/reports' }]"
  >
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
          <EmptyState
            v-if="!ready"
            :title="t(`reports.choose.${loaded.report.scope}`)"
            :description="t('reports.choose-description')"
            icon="i-lucide-mouse-pointer-click"
          />
          <DataBoundary
            v-else
            :data="totals"
            :status="reading"
            :error="readError"
            @retry="reread()"
          >
            <div class="space-y-8">
              <p class="text-sm text-muted">
                {{ question }}
              </p>
              <FactStrip
                :facts="facts"
                framed
              />
              <ChartFigure
                v-if="chartRows.length && charted"
                :title="t(charted.label)"
                :summary="chartSummary"
                :data="chartRows"
                index="name"
                :categories="[{ key: 'value', label: t(charted.label) }]"
              />
              <ReportTable
                v-if="by && rows.length"
                :figures="visible"
                :rows="rows"
                :totals="totals"
                :by="by"
                :caption="question"
              />
              <p
                v-else-if="by"
                class="text-sm text-muted"
              >
                {{ t('reports.nothing') }}
              </p>
              <p
                v-if="hidden"
                class="text-sm text-muted"
              >
                {{ t('reports.hidden', { count: hidden }) }}
              </p>
            </div>
          </DataBoundary>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
