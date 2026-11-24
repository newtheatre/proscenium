<!-- K3 Sessions (training-records part 5, "Console"): each session with its course, space, places taken
     of capacity, those waiting and its state. Upcoming first; those still to mark and past ones a view away. -->
<script setup lang="ts">
import { sessionsList } from '../../../../../shared/lists'
import type { SessionState } from '../../../../../shared/states'
import type { SessionOptions } from '../../../../../server/console-sessions'

definePageMeta({ layout: 'console' })

interface Row { id: string, courseTitle: string, title: string | null, startsAt: number, endsAt: number, spaceName: string | null, placeNote: string | null, capacity: number, placesTaken: number, waiting: number, status: SessionState }

const { t } = useT()
const { dateTime } = useDates()
const creating = ref(false)
const { data: catalogue } = useAPI<{ courses: { id: string, title: string }[] }>('/api/training/courses', { key: 'training:console-course-choices', lazy: true, server: false })
const { data: options } = useAPI<SessionOptions>('/api/training/console/session-options', { key: 'training:session-options', lazy: true, server: false })
const canCreate = computed(() => !!options.value?.create)

const relabel = <T extends Record<string, { label: string }>>(entries: T, prefix: string) =>
  Object.fromEntries(Object.entries(entries).map(([key, v]) => [key, { ...v, label: t(`${prefix}.${key}`) }])) as T
const list = computed(() => ({
  ...sessionsList,
  filters: {
    course: { ...sessionsList.filters.course, label: t('training.sessions-list.column.course'), options: (catalogue.value?.courses ?? []).map(c => ({ value: c.id, label: c.title })) },
    when: { ...sessionsList.filters.when, label: t('training.sessions-list.when'), options: sessionsList.filters.when.options.map(o => ({ value: o.value, label: t(`training.sessions-list.view.${o.value}`) })) },
    status: { ...sessionsList.filters.status, label: t('training.sessions-list.column.status'), options: sessionsList.filters.status.options.map(o => ({ value: o.value, label: t(`training.session-states.${o.value}`) })) },
  },
  sorts: { starts: { ...sessionsList.sorts.starts, label: t('training.sessions-list.column.starts') } },
  columns: relabel(sessionsList.columns, 'training.sessions-list.column'),
  views: relabel(sessionsList.views, 'training.sessions-list.view'),
}))
const TONE = { unpublished: 'neutral', published: 'success', cancelled: 'neutral', completed: 'neutral' } as const
const name = (row: Row) => row.title ? `${row.title}, ${row.courseTitle}` : row.courseTitle
</script>

<template>
  <PageList
    :title="t('training.navigation.sessions.label')"
    route="/api/training/console/sessions"
    :list="list"
    :row-label="(row: Row) => `${dateTime(row.startsAt)}, ${name(row)}`"
    :row-to="(row: Row) => `/console/training/sessions/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('training.sessions-list.empty.title'), description: t('training.sessions-list.empty.description'), icon: 'i-lucide-calendar-days' }"
  >
    <template
      v-if="canCreate"
      #primary
    >
      <UButton
        icon="i-lucide-plus"
        :label="t('training.sessions-list.new')"
        @click="creating = true"
      />
    </template>
    <template #cell-starts="{ row }">
      {{ dateTime((row as Row).startsAt) }}
    </template>
    <template #cell-course="{ row }">
      {{ name(row as Row) }}
    </template>
    <template #cell-space="{ row }">
      {{ (row as Row).spaceName ?? (row as Row).placeNote ?? t('training.sessions-list.no-space') }}
    </template>
    <template #cell-places="{ row }">
      {{ t('training.sessions-list.places', { taken: (row as Row).placesTaken, capacity: (row as Row).capacity }) }}
    </template>
    <template #cell-status="{ row }">
      <StatusBadge
        :tone="TONE[(row as Row).status]"
        :label="t(`training.session-states.${(row as Row).status}`)"
      />
    </template>
    <TrainingSessionDialog
      v-if="canCreate"
      v-model:open="creating"
      @saved="(id: string) => navigateTo(`/console/training/sessions/${encodeURIComponent(id)}`)"
    />
  </PageList>
</template>
