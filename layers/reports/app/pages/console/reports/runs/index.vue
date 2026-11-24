<!-- Saved copies (REP-10): every copy of a report this person may open today, newest first, with its
     question and whether it is ready. Opening one checks the figures' abilities again (R6). -->
<script setup lang="ts">
import type { RunListed } from '../../../../composables/useRunState'

definePageMeta({ layout: 'console' })

const { t } = useT()
const { dateTime } = useDates()
const questionText = useQuestionText()
const { words, keyName } = useReportWords()
const questionOf = (q: RunListed['question']) => questionText(q.scope.title, q.period.from, q.period.to, q.rowsBy ? keyName(q.rowsBy, q.keyLabels) : undefined, q.acrossBy ? keyName(q.acrossBy, q.keyLabels) : undefined)
const { badge } = useRunState()
const { data, status, error, refresh } = await useAPI<{ runs: RunListed[] }>('/api/reports/runs', { key: 'reports:runs' })
</script>

<template>
  <PageFrame
    :title="t('reports.runs.title')"
    :description="t('reports.runs.description')"
    :trail="[{ label: t('reports.title'), to: '/console/reports' }]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.runs.length"
        :title="t('reports.runs.empty')"
        :description="t('reports.runs.empty-description')"
        icon="i-lucide-files"
      />
      <RecordList
        v-else
        :label="t('reports.runs.title')"
      >
        <RecordListItem
          v-for="run in data.runs"
          :key="run.id"
          :to="`/console/reports/runs/${run.id}`"
          icon="i-lucide-file-chart-column"
          :name="words(run.name)"
          :description="`${questionOf(run.question)}. ${t(run.mine ? 'reports.runs.made-by-me' : 'reports.runs.made', { when: dateTime(run.createdAt) })}`"
        >
          <template #trailing>
            <UBadge
              v-bind="badge(run.state)"
              variant="subtle"
            />
          </template>
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
