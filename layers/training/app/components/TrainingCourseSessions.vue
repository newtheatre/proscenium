<!-- M3's Sessions tab: the course's sessions to come, each with when, where and places left in words. -->
<script setup lang="ts">
import type { LearnerCourse } from '../../server/learner'

defineProps<{ sessions: LearnerCourse['sessions'] }>()
const { t } = useT()
const { dateTime } = useDates()
const places = (s: LearnerCourse['sessions'][number]) => s.placesLeft ? t('training.sessions.places-left', { count: s.placesLeft }) : t('training.sessions.full')
</script>

<template>
  <EmptyState
    v-if="!sessions.length"
    :title="t('training.sessions.none.title')"
    :description="t('training.sessions.none.description')"
    icon="i-lucide-calendar-x"
  />
  <RecordList
    v-else
    :label="t('training.course.sessions')"
  >
    <RecordListItem
      v-for="s in sessions"
      :key="s.id"
      :to="`/members/training/sessions/${encodeURIComponent(s.id)}`"
      icon="i-lucide-calendar"
      :name="s.title ?? dateTime(s.startsAt)"
      :description="[s.title ? dateTime(s.startsAt) : null, s.spaceName ?? s.placeNote, places(s)].filter(Boolean).join(' · ')"
    />
  </RecordList>
</template>
