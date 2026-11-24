<!-- A new report (REP-12): from nothing, or a copy of a ready-made one (`?from=`), whose figures and
     layout it starts with. -->
<script setup lang="ts">
import type { BuilderForm } from '../../../components/ReportBuilder.vue'

definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const from = computed(() => typeof route.query.from === 'string' ? route.query.from : null)
const blank: BuilderForm = { name: '', description: null, basedOn: null, columns: [], rowsBy: null, acrossBy: null, filter: null, scopeKind: 'none', scopeId: null, periodRule: 'last-month', chart: null, shareRole: null }
const { data, status, error, refresh } = await useAPI<BuilderForm>(() => from.value ? `/api/reports/definitions/${from.value}/form` : '/api/reports/definitions/none/form', {
  key: `reports:draft:${from.value ?? ''}`,
  immediate: !!from.value,
  default: () => blank,
})
</script>

<template>
  <PageFrame
    :title="t('reports.builder.new-title')"
    :trail="[{ label: t('reports.title'), to: '/console/reports' }]"
  >
    <DataBoundary
      :data="data"
      :status="from ? status : 'success'"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: start }">
        <ReportBuilder :start="start" />
      </template>
    </DataBoundary>
  </PageFrame>
</template>
