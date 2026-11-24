<!-- Reports (REP-04): the ready-made reports the person may open, grouped by area. Each figure on a
     report is still checked when it is read, so a report can open with some figures left out. -->
<script setup lang="ts">
import type { Area, ScopeKind } from '../../../../shared/reports'

definePageMeta({ layout: 'console' })

interface Listed { id: string, label: string, description: string, area: Area, scope: ScopeKind, module: string }

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ reports: Listed[] }>('/api/reports/definitions', { key: 'reports:definitions' })

const search = ref('')
const searching = ref(false)
const groups = computed(() => {
  const words = search.value.trim().toLowerCase()
  const out = new Map<Area, Listed[]>()
  for (const report of data.value?.reports ?? []) {
    const name = t(report.label)
    if (words && !name.toLowerCase().includes(words) && !t(report.description).toLowerCase().includes(words)) continue
    out.set(report.area, [...out.get(report.area) ?? [], report])
  }
  return [...out.entries()].map(([area, reports]) => ({ area, reports }))
})
</script>

<template>
  <PageFrame
    :title="t('reports.title')"
    :description="t('reports.description')"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.reports.length"
        v-model="search"
        v-model:open="searching"
        :label="t('reports.search')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.reports.length"
        :title="t('reports.empty')"
        :description="t('reports.empty-description')"
        icon="i-lucide-chart-column"
      />
      <p
        v-else-if="!groups.length"
        class="text-sm text-muted"
      >
        {{ t('reports.no-match', { search: search.trim() }) }}
      </p>
      <div
        v-else
        class="space-y-8"
      >
        <PageSection
          v-for="group in groups"
          :key="group.area"
          :title="t(`reports.areas.${group.area}`)"
        >
          <RecordList :label="t(`reports.areas.${group.area}`)">
            <RecordListItem
              v-for="report in group.reports"
              :key="report.id"
              :to="`/console/reports/${report.id}`"
              icon="i-lucide-chart-column"
              :name="t(report.label)"
              :description="t(report.description)"
            />
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
