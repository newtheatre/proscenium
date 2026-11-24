<!-- K1 Courses (training-records part 5, "Console"): each course with its state, live version, how
     many hold it now and how many lapse within the warning. Retired courses are a view away. -->
<script setup lang="ts">
import { coursesList } from '../../../../../shared/lists'
import type { CourseState } from '../../../../../shared/states'

definePageMeta({ layout: 'console' })

interface Row { id: string, title: string, status: CourseState, version: number | null, preparing: boolean, current: number, lapsing: number }

const { t } = useT()
const creating = ref(false)
const TONE = { unpublished: 'neutral', live: 'success', retired: 'neutral' } as const

const list = computed(() => ({
  ...coursesList,
  filters: {
    status: { ...coursesList.filters.status, label: t('training.courses-list.column.status'), options: coursesList.filters.status.options.map(o => ({ value: o.value, label: t(`training.course-states.${o.value}`) })) },
  },
  sorts: { title: { ...coursesList.sorts.title, label: t('training.courses-list.column.title') } },
  columns: Object.fromEntries(Object.entries(coursesList.columns).map(([key, c]) => [key, { ...c, label: t(`training.courses-list.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(coursesList.views).map(([key, v]) => [key, { ...v, label: t(`training.courses-list.view.${key}`) }])),
}))
const version = (row: Row) => row.version === null
  ? t('training.courses-list.no-version')
  : row.preparing ? t('training.courses-list.version-preparing', { number: row.version }) : t('training.courses-list.version', { number: row.version })
</script>

<template>
  <PageList
    :title="t('training.navigation.courses.label')"
    route="/api/training/console/courses"
    :list="list"
    :row-label="(row: Row) => row.title"
    :row-to="(row: Row) => `/console/training/courses/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('training.courses-list.empty.title'), description: t('training.courses-list.empty.description'), icon: 'i-lucide-graduation-cap' }"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('training.courses-list.new')"
        @click="creating = true"
      />
    </template>
    <template #cell-status="{ row }">
      <StatusBadge
        :tone="TONE[row.status as CourseState]"
        :label="t(`training.course-states.${row.status}`)"
      />
    </template>
    <template #cell-version="{ row }">
      {{ version(row as Row) }}
    </template>
    <template #cell-lapsing="{ row }">
      <StatusBadge
        v-if="row.lapsing"
        tone="warning"
        :label="String(row.lapsing)"
      />
      <span v-else>0</span>
    </template>
    <TrainingCourseDialog
      v-model:open="creating"
      @saved="(id: string) => navigateTo(`/console/training/courses/${encodeURIComponent(id)}`)"
    />
  </PageList>
</template>
