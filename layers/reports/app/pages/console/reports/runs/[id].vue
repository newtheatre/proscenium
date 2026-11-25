<!-- A copy of a report (REP-10): the figures as they stood when it was made, its question in words and
     anything that could not answer, with its CSV. While it is being worked out the page checks again
     every few seconds. Opening it checks today's abilities (R6). -->
<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import type { RunOpened } from '../../../../composables/useRunState'

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

const run = computed(() => data.value)
const question = computed(() => run.value ? questionText(run.value.question.scope.title, run.value.question.period.from, run.value.question.period.to, run.value.question.by) : '')
const table = computed(() => run.value?.table ?? null)
const facts = computed(() => (table.value?.visible ?? []).map(f => ({ label: t(f.label), value: text(f.unit, table.value!.totals[f.id]).text })))
const figureLabel = (measure: string) => {
  const figure = run.value?.question.figures.find(f => f.id === measure)
  return figure ? t(figure.label) : measure
}
const actions = computed(() => run.value?.state === 'done' && table.value
  ? [{ label: t('reports.copy.download'), icon: 'i-lucide-download', to: `/api/reports/runs/${id.value}/csv` }]
  : [])
</script>

<template>
  <PageFrame
    :title="run ? t(run.label) : t('reports.runs.title')"
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
            <FactStrip
              :facts="facts"
              framed
            />
            <ReportTable
              v-if="loaded.question.by && table.rows.length"
              :figures="table.visible"
              :rows="table.rows"
              :totals="table.totals"
              :by="loaded.question.by"
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
