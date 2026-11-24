<!-- A copy of a report (REP-10): the figures as they stood when it was made, its question in words and
     anything that could not answer, with its CSV. While it is being worked out the page checks again
     every few seconds. Opening it checks today's abilities (R6). -->
<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import type { RunOpened } from '../../../../composables/useRunState'
import type { ReportColumn } from '../../../../../shared/reports'
import { cellKey } from '../../../../../shared/table'

definePageMeta({ layout: 'console' })

const WAIT = 2000 // not-policy: how often a copy being made is checked

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<RunOpened>(() => `/api/reports/runs/${id.value}`, { key: `reports:run:${id.value}` })
const { dateTime } = useDates()
const { text } = useFigureText()
const questionText = useQuestionText()
const { badge } = useRunState()

const working = computed(() => data.value?.state === 'queued' || data.value?.state === 'running')
const { pause } = useIntervalFn(() => { if (working.value) void refresh() }, WAIT)
watch(working, (now) => { if (!now) pause() })

const { words, keyName } = useReportWords()
const run = computed(() => data.value)
const question = computed(() => {
  const q = run.value?.question
  return q ? questionText(q.scope.title, q.period.from, q.period.to, q.rowsBy ? keyName(q.rowsBy, q.keyLabels) : undefined, q.acrossBy ? keyName(q.acrossBy, q.keyLabels) : undefined) : ''
})
const filterChip = computed(() => {
  const q = run.value?.question
  return q?.filter ? `${keyName(q.filter.key, q.keyLabels)}: ${q.filter.values.map(v => q.filter!.labels[v] ?? v).join(', ')}` : null
})
const table = computed(() => run.value?.table ?? null)
const label = (c: ReportColumn) => c.kind === 'formula' ? c.label : t(c.label)
const facts = computed(() => (table.value?.columns ?? []).flatMap((c, i) => c.shown ? [{ label: label(c), value: text(c.unit, table.value!.totals[cellKey(i, null)]).text }] : []))
const figureLabel = (measure: string) => {
  const figure = run.value?.question.columns.find(c => c.kind === 'figure' && c.id === measure)
  return figure && !(figure.kind === 'figure' && figure.gone) ? label(figure) : measure
}
const actions = computed(() => run.value?.state === 'done' && table.value
  ? [{ label: t('reports.copy.download'), icon: 'i-lucide-download', to: `/api/reports/runs/${id.value}/csv` }]
  : [])
</script>

<template>
  <PageFrame
    :title="run ? words(run.name) : t('reports.runs.title')"
    :description="question"
    :trail="[{ label: t('reports.title'), to: '/console/reports' }, { label: t('reports.runs.title'), to: '/console/reports/runs' }]"
  >
    <template
      v-if="run"
      #status
    >
      <UBadge
        v-bind="badge(run.state)"
        variant="subtle"
      />
    </template>
    <template
      v-if="actions.length"
      #primary
    >
      <UButton
        v-for="action in actions"
        :key="action.to"
        :label="action.label"
        :icon="action.icon"
        :to="action.to"
        external
        download
      />
    </template>
    <DataBoundary
      :data="run"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-8">
          <p class="text-sm text-muted">
            {{ t(loaded.mine ? 'reports.runs.made-by-me' : 'reports.runs.made', { when: dateTime(loaded.createdAt) }) }}
          </p>
          <EmptyState
            v-if="working"
            :title="t('reports.runs.working')"
            :description="t('reports.runs.working-description')"
            icon="i-lucide-loader-circle"
          />
          <EmptyState
            v-else-if="loaded.state === 'failed'"
            :title="t('reports.runs.failed')"
            :description="t(`reports.runs.failures.${loaded.failure === 'reports.run.too-large' ? 'too-large' : 'other'}`)"
            icon="i-lucide-circle-alert"
          />
          <EmptyState
            v-else-if="!table"
            :title="t('reports.runs.expired')"
            :description="t('reports.runs.expired-description')"
            icon="i-lucide-archive"
          />
          <template v-else>
            <UBadge
              v-if="filterChip"
              :label="filterChip"
              icon="i-lucide-filter"
              color="neutral"
              variant="outline"
            />
            <FactStrip
              :facts="facts"
              framed
            />
            <ReportTable
              v-if="loaded.question.rowsBy && table.rows.length"
              :table="table"
              :by-label="keyName(loaded.question.rowsBy, loaded.question.keyLabels)"
              :caption="question"
            />
            <ul
              v-if="loaded.unavailable.length"
              class="space-y-1 text-sm text-muted"
            >
              <li
                v-for="u in loaded.unavailable"
                :key="u.measure"
              >
                {{ t('reports.runs.not-available', { figure: figureLabel(u.measure), reason: t(`reports.unavailable.${u.reason}`) }) }}
              </li>
            </ul>
          </template>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
