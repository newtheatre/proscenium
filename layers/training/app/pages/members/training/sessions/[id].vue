<!-- M4 A session (training-records part 5): when, where, who runs it, places left in words and the
     person's own place, with the one action their place allows. -->
<script setup lang="ts">
import type { SessionView } from '../../../../composables/useSessionPlace'

const { t } = useT()
const { dateTime, time } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<SessionView>(() => `/api/training/sessions/${encodeURIComponent(id.value)}`, { key: `training:session:${id.value}` })
const { action, note, refusal } = useSessionPlace(data, refresh)

const placesLeft = computed(() => {
  const s = data.value?.session
  if (!s) return ''
  const left = Math.max(0, s.capacity - s.placesTaken)
  return left ? t('training.sessions.places-left', { count: left }) : t('training.sessions.full')
})
const summary = computed(() => {
  const d = data.value
  if (!d) return []
  const s = d.session
  const trainers = d.trainers.map(x => x.name).filter(Boolean).join(', ')
  return [
    { label: t('training.session.when'), value: t('training.session.from-to', { from: dateTime(s.startsAt), to: time(s.endsAt) }) },
    ...(s.spaceName || s.placeNote ? [{ label: t('training.session.where'), value: [s.spaceName, s.placeNote].filter(Boolean).join(', ') }] : []),
    ...(trainers ? [{ label: t('training.session.trainers'), value: trainers }] : []),
    { label: t('training.session.places'), value: placesLeft.value },
  ]
})
const mine = computed(() => {
  const m = data.value?.mine
  if (!m) return null
  if (m.state === 'waiting') {
    const position = data.value!.times.position ?? 1
    return { tone: 'info' as const, label: t('training.session.waiting', { count: position, position }) }
  }
  return { tone: m.state === 'absent' ? 'neutral' as const : 'success' as const, label: t(`training.place-states.${m.state}`) }
})
const trail = computed(() => [
  { label: t('training.navigation.home.label'), to: '/members/training' },
  ...(data.value?.courseSlug ? [{ label: data.value.session.courseTitle, to: `/members/training/courses/${encodeURIComponent(data.value.courseSlug)}` }] : []),
])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="d.session.title ?? d.session.courseTitle"
        :trail="trail"
        width="reading"
      >
        <template #status>
          <StatusBadge
            v-if="mine"
            :tone="mine.tone"
            :label="mine.label"
          />
        </template>
        <template #primary>
          <UButton
            v-if="action"
            :icon="action.icon"
            :label="action.label"
            :color="'quiet' in action ? 'neutral' : undefined"
            :variant="'quiet' in action ? 'outline' : undefined"
            loading-auto
            @click="action.run"
          />
        </template>
        <div class="space-y-6">
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="note"
            color="neutral"
            variant="outline"
            icon="i-lucide-info"
            :title="note"
          />
          <FactStrip :facts="summary" />
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
