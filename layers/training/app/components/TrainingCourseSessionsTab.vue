<!-- K2's Sessions tab: the course's sessions to come, each with when, where, places taken and its state,
     "New session" for a live course, and every session of the course on K3. -->
<script setup lang="ts">
import type { SessionState } from '../../shared/states'

interface Row { id: string, title: string | null, courseTitle: string, startsAt: number, spaceName: string | null, placeNote: string | null, capacity: number, placesTaken: number, waiting: number, status: SessionState }

const props = defineProps<{ courseId: string, live: boolean, manage: boolean }>()
const { t } = useT()
const { dateTime } = useDates()
const creating = ref(false)
const { data, refresh } = useAPI<{ rows: Row[] }>(() => `/api/training/console/sessions?course=${encodeURIComponent(props.courseId)}`, { key: `training:course-sessions:${props.courseId}`, lazy: true, server: false })
const TONE = { unpublished: 'neutral', published: 'success', cancelled: 'neutral', completed: 'neutral' } as const
const where = (r: Row) => r.spaceName ?? r.placeNote ?? t('training.sessions-list.no-space')
const facts = (r: Row) => [where(r), t('training.course-sessions.places', { taken: r.placesTaken, capacity: r.capacity }), r.waiting ? t('training.course-sessions.waiting', { count: r.waiting }) : ''].filter(Boolean).join(', ')

async function made(sessionId: string) {
  await refresh()
  await navigateTo(`/console/training/sessions/${encodeURIComponent(sessionId)}`)
}
</script>

<template>
  <div class="space-y-4">
    <RecordList
      v-if="data?.rows.length"
      :label="t('training.course-record.tab.sessions')"
    >
      <RecordListItem
        v-for="r in data.rows"
        :key="r.id"
        icon="i-lucide-calendar-days"
        :to="`/console/training/sessions/${encodeURIComponent(r.id)}`"
        :name="r.title ? `${dateTime(r.startsAt)}, ${r.title}` : dateTime(r.startsAt)"
        :description="facts(r)"
      >
        <StatusBadge
          :tone="TONE[r.status]"
          :label="t(`training.session-states.${r.status}`)"
        />
      </RecordListItem>
    </RecordList>
    <EmptyState
      v-else-if="data"
      icon="i-lucide-calendar-x"
      :title="t('training.course-sessions.none')"
    />
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-if="manage && live"
        icon="i-lucide-plus"
        :label="t('training.sessions-list.new')"
        @click="creating = true"
      />
      <UButton
        color="neutral"
        variant="link"
        :to="`/console/training/sessions?course=${encodeURIComponent(courseId)}&view=all`"
        :label="t('training.course-sessions.all')"
      />
    </div>
    <TrainingSessionDialog
      v-if="manage && live"
      v-model:open="creating"
      :course-id="courseId"
      @saved="made"
    />
  </div>
</template>
