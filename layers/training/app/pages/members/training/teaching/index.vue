<!-- M7 Teaching (training-records part 5; TR-45): sessions I lead that need marking, people who used
     their quiz tries, sessions coming up and people part-way through my courses. -->
<script setup lang="ts">
import type { Teaching } from '../../../../../server/teaching'

const { t } = useT()
const { dateTime, brief } = useDates()
const { data, status, error, refresh } = await useAPI<Teaching>('/api/training/teaching', { key: 'training:teaching' })
const { allow } = useAnotherTry(refresh)

const marking = (id: string) => `/members/training/teaching/sessions/${encodeURIComponent(id)}`
const signOff = (courseId: string) => `/members/training/teaching/sign-off?course=${encodeURIComponent(courseId)}`
const where = (s: Teaching['upcoming'][number]) => [dateTime(s.startsAt), s.spaceName ?? s.placeNote].filter(Boolean).join(', ')
const nothing = computed(() => {
  const d = data.value
  return !!d && !d.toMark.length && !d.triesUsed.length && !d.upcoming.length && !d.partWay.length
})
const trail = computed(() => [{ label: t('training.navigation.home.label'), to: '/members/training' }])
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
        :title="t('training.navigation.teach.label')"
        :trail="trail"
      >
        <template #primary>
          <UButton
            v-if="d.courses.some(c => c.steps.length)"
            to="/members/training/teaching/sign-off"
            icon="i-lucide-badge-check"
            :label="t('training.teaching.sign-off')"
          />
        </template>
        <EmptyState
          v-if="!d.courses.length"
          icon="i-lucide-presentation"
          :title="t('training.teaching.empty.title')"
          :description="t('training.teaching.empty.description')"
        />
        <EmptyState
          v-else-if="nothing"
          icon="i-lucide-calendar-check"
          :title="t('training.teaching.quiet.title')"
          :description="t('training.teaching.quiet.description', { courses: d.courses.map(c => c.title).join(', ') })"
        />
        <div
          v-else
          class="space-y-8"
        >
          <PageSection
            v-if="d.toMark.length"
            :title="t('training.teaching.to-mark')"
          >
            <RecordList :label="t('training.teaching.to-mark')">
              <RecordListItem
                v-for="s in d.toMark"
                :key="s.id"
                :to="marking(s.id)"
                icon="i-lucide-clipboard-check"
                :name="s.title ?? s.courseTitle"
                :description="where(s)"
              >
                <StatusBadge
                  :tone="s.unmarked ? 'warning' : 'success'"
                  :label="s.unmarked ? t('training.teaching.unmarked', { count: s.unmarked }) : t('training.teaching.all-marked')"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.triesUsed.length"
            :title="t('training.teaching.tries-used')"
            :description="t('training.teaching.tries-used-help')"
          >
            <RecordList :label="t('training.teaching.tries-used')">
              <RecordListItem
                v-for="p in d.triesUsed"
                :key="`${p.accountId}:${p.stepId}`"
                icon="i-lucide-circle-help"
                :name="p.name ?? t('training.teaching.no-name')"
                :description="t('training.teaching.next-try', { quiz: p.stepTitle, course: p.courseTitle, when: brief(p.nextTryAt) })"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-rotate-ccw"
                    :label="t('training.teaching.allow')"
                    loading-auto
                    @click="allow(p)"
                  />
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.upcoming.length"
            :title="t('training.teaching.upcoming')"
          >
            <RecordList :label="t('training.teaching.upcoming')">
              <RecordListItem
                v-for="s in d.upcoming"
                :key="s.id"
                :to="marking(s.id)"
                icon="i-lucide-calendar"
                :name="s.title ?? s.courseTitle"
                :description="where(s)"
              >
                <span class="text-sm text-muted">{{ t('training.teaching.places', { taken: s.placesTaken, capacity: s.capacity }) }}</span>
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.partWay.length"
            :title="t('training.teaching.part-way')"
          >
            <RecordList :label="t('training.teaching.part-way')">
              <RecordListItem
                v-for="p in d.partWay"
                :key="`${p.accountId}:${p.courseId}`"
                :to="signOff(p.courseId)"
                icon="i-lucide-user-round"
                :name="p.name ?? t('training.teaching.no-name')"
                :description="p.courseTitle"
              >
                <StatusBadge
                  tone="info"
                  :label="t('training.status.in-progress', { done: p.done, of: p.of })"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
