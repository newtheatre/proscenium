<!-- A people report's body (REP-35): the banner that says opening it is recorded, then one row per
     person read live. Keeping a copy and downloading live on the page's own actions. -->
<script setup lang="ts">
import type { ReportView } from '../../shared/reports'
import type { PeopleTable } from '../../shared/people'

const props = defineProps<{ view: ReportView, by?: string, question: string }>()

const { t } = useT()
const query = computed(() => ({
  report: props.view.id,
  period: props.view.period.rule,
  ...(props.view.period.rule === 'chosen' ? { from: props.view.period.from, to: props.view.period.to } : {}),
  ...(props.view.scope.id ? { scope: `${props.view.scope.kind}:${props.view.scope.id}` } : {}),
  ...(props.by ? { by: props.by } : {}),
}))
const { data, status, error, refresh } = useAPI<PeopleTable>('/api/reports/people', { query, key: computed(() => `reports:people:${JSON.stringify(query.value)}`), watch: [query] })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: table }">
      <div class="space-y-6">
        <p class="text-sm text-muted">
          {{ question }}
        </p>
        <ReportPeopleTable
          :table="table"
          :caption="question"
        />
        <p
          v-if="table.hidden"
          class="text-sm text-muted"
        >
          {{ t('reports.hidden', { count: table.hidden }) }}
        </p>
      </div>
    </template>
  </DataBoundary>
</template>
