<!-- M3 A course (training-records part 5; amended part 5): a strip of how it is learnt, how long it
     lasts and where the person stands, then tabs for the steps with an action each, the sessions to
     come and what changed between versions. The primary action follows the first step not yet done. -->
<script setup lang="ts">
import type { LearnerCourse } from '../../../../../server/learner'
import type { EvidenceStep } from '../../../../composables/useEvidenceForm'

const { t } = useT()
const { day, dayLong } = useDates()
const { status: word, ways, validFor } = useTrainingWords()
const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug))
const { data, status, error, refresh } = await useAPI<LearnerCourse>(() => `/api/training/me/courses/${encodeURIComponent(slug.value)}`, { key: `training:course:${slug.value}` })

const tab = computed({
  get: () => ['steps', 'sessions', 'changes'].includes(String(route.query.tab)) ? String(route.query.tab) : 'steps',
  set: v => router.replace({ query: { ...route.query, tab: v === 'steps' ? undefined : v } }),
})
const tabs = computed(() => [
  { value: 'steps', label: t('training.course.steps') },
  { value: 'sessions', label: t('training.course.sessions'), badge: data.value?.sessions.length || undefined },
  { value: 'changes', label: t('training.course.changes') },
])
const panel = ref<EvidenceStep | null>(null)
async function sent() {
  panel.value = null
  await refresh()
}

const summary = computed(() => {
  const c = data.value
  if (!c) return []
  const mine = c.mine
  return [
    { label: t('training.course.ways'), value: ways(c.ways) || t('training.course.no-ways') },
    { label: t('training.course.valid-for'), value: validFor(c.course) },
    ...(mine ? [{ label: t('training.course.my-status'), value: word(mine.status, mine.done, mine.of).label }] : []),
    ...(mine?.record?.expiresAt ? [{ label: t('training.course.expires'), value: day(mine.record.expiresAt) }] : []),
  ]
})
const next = computed(() => data.value?.steps.find(s => !s.met))
const primary = computed(() => {
  const c = data.value
  const s = next.value
  if (!c || !s) return null
  if (s.action.kind === 'session' && c.sessions.length) return { label: t('training.steps.sign-up'), to: `/members/training/sessions/${encodeURIComponent((c.sessions.find(x => x.placesLeft) ?? c.sessions[0]!).id)}` }
  if ((s.action.kind === 'certificate' || s.action.kind === 'declaration') && !s.action.waiting && !(s.action.kind === 'declaration' && s.action.hasQuestions)) {
    const step: EvidenceStep = { id: s.id, title: s.title, action: s.action }
    return { label: t(s.action.kind === 'certificate' ? 'training.steps.send-certificate' : 'training.steps.declare'), run: () => { panel.value = step } }
  }
  return null
})
const trail = computed(() => [{ label: t('training.navigation.home.label'), to: '/members/training' }, { label: t('training.courses.title'), to: '/members/training/courses' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: c }">
      <PageFrame
        :title="c.course.title"
        :description="c.course.summary ?? undefined"
        :trail="trail"
      >
        <template #status>
          <TrainingStatusBadge
            v-if="c.mine"
            :status="c.mine.status"
            :done="c.mine.done"
            :of="c.mine.of"
          />
        </template>
        <template #primary>
          <UButton
            v-if="primary?.to"
            :to="primary.to"
            :label="primary.label"
          />
          <UButton
            v-else-if="primary?.run"
            :label="primary.label"
            @click="primary.run"
          />
        </template>
        <div class="space-y-6">
          <FactStrip :facts="summary" />
          <UTabs
            v-model="tab"
            :items="tabs"
            :content="false"
            variant="link"
            class="w-fit max-w-full"
          />
          <TrainingCourseSteps
            v-if="tab === 'steps'"
            :course-id="c.course.id"
            :steps="c.steps"
            :sessions="c.sessions.length"
            @sessions="tab = 'sessions'"
            @evidence="s => { panel = s }"
            @changed="refresh()"
          />
          <TrainingCourseSessions
            v-else-if="tab === 'sessions'"
            :sessions="c.sessions"
          />
          <RecordList
            v-else
            :label="t('training.course.changes')"
          >
            <RecordListItem
              v-for="v in c.changes"
              :key="v.number"
              icon="i-lucide-history"
              :name="t('training.course.version', { number: v.number, date: v.publishedAt ? dayLong(v.publishedAt) : '' })"
              :description="v.changeNote ?? (v.changeKind ? t(`training.change-kinds.${v.changeKind}`) : t('training.course.first-version'))"
            />
          </RecordList>
        </div>
        <TrainingEvidencePanel
          :course-id="c.course.id"
          :step="panel"
          @close="panel = null"
          @sent="sent"
        />
      </PageFrame>
    </template>
  </DataBoundary>
</template>
