<!-- Changing a saved report (REP-12): its maker, or someone who manages reports. -->
<script setup lang="ts">
import type { BuilderForm } from '../../../../components/ReportBuilder.vue'

definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<BuilderForm & { id: string }>(() => `/api/reports/definitions/${id.value}/form`, { key: `reports:form:${id.value}` })
</script>

<template>
  <PageFrame
    :title="data?.name ?? t('reports.builder.edit-title')"
    :trail="[{ label: t('reports.title'), to: '/console/reports' }, ...(data ? [{ label: data.name, to: `/console/reports/${id}` }] : [])]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: start }">
        <ReportBuilder
          :id="id"
          :start="start"
        />
      </template>
    </DataBoundary>
  </PageFrame>
</template>
