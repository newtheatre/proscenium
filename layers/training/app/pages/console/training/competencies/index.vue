<!-- K8 Competencies (training-records part 5, "Console"): each competency with the courses its routes
     name and how many hold it now. Retired ones are a view away. -->
<script setup lang="ts">
import { competenciesList } from '../../../../../shared/lists'

definePageMeta({ layout: 'console' })

interface Row { id: string, title: string, status: 'active' | 'retired', routes: number, courses: string[], holders: number }

const { t } = useT()
const creating = ref(false)
const relabel = <T extends Record<string, { label: string }>>(entries: T, prefix: string) =>
  Object.fromEntries(Object.entries(entries).map(([key, v]) => [key, { ...v, label: t(`${prefix}.${key}`) }])) as T
const list = computed(() => ({
  ...competenciesList,
  filters: {
    status: { ...competenciesList.filters.status, label: t('training.competencies-list.column.status'), options: competenciesList.filters.status.options.map(o => ({ value: o.value, label: t(`training.competency-states.${o.value}`) })) },
  },
  sorts: { title: { ...competenciesList.sorts.title, label: t('training.competencies-list.column.title') } },
  columns: relabel(competenciesList.columns, 'training.competencies-list.column'),
  views: relabel(competenciesList.views, 'training.competencies-list.view'),
}))
</script>

<template>
  <PageList
    :title="t('training.navigation.competencies.label')"
    route="/api/training/console/competencies"
    :list="list"
    :row-label="(row: Row) => row.title"
    :row-to="(row: Row) => `/console/training/competencies/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('training.competencies-list.empty.title'), description: t('training.competencies-list.empty.description'), icon: 'i-lucide-badge-check' }"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('training.competencies-list.new')"
        @click="creating = true"
      />
    </template>
    <template #cell-courses="{ row }">
      {{ (row as Row).courses.length ? (row as Row).courses.join(', ') : t('training.competencies-list.no-courses') }}
    </template>
    <template #cell-status="{ row }">
      <StatusBadge
        :tone="(row as Row).status === 'active' ? 'success' : 'neutral'"
        :label="t(`training.competency-states.${(row as Row).status}`)"
      />
    </template>
    <TrainingCompetencyDialog
      v-model:open="creating"
      @saved="(id: string) => navigateTo(`/console/training/competencies/${encodeURIComponent(id)}`)"
    />
  </PageList>
</template>
