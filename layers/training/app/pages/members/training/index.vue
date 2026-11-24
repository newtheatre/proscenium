<!-- M1 Training (training-records part 5): what needs doing first, as cards in order of urgency,
     then what the person holds. With nothing held or booked, the way to the courses. -->
<script setup lang="ts">
import type { MyTraining } from '../../../../server/learner'

const { t } = useT()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<MyTraining>('/api/training/me', { key: 'training:me' })
const nudges = useTrainingNudges(data)
const course = (slug: string) => `/members/training/courses/${encodeURIComponent(slug)}`
const expiry = (r: MyTraining['records'][number]) => r.expiresAt ? t('training.home.until', { date: day(r.expiresAt) }) : t('training.course.no-expiry')
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame :title="t('training.navigation.home.label')">
        <template #primary>
          <UButton
            to="/members/training/courses"
            icon="i-lucide-graduation-cap"
            :label="t('training.home.all-courses')"
          />
        </template>
        <EmptyState
          v-if="!d.records.length && !d.places.length && !d.inProgress.length && !d.notApproved.length"
          :title="t('training.home.empty.title')"
          :description="t('training.home.empty.description')"
          icon="i-lucide-graduation-cap"
          :action="{ label: t('training.home.empty.action'), to: '/members/training/courses' }"
        />
        <div
          v-else
          class="space-y-8"
        >
          <ul
            v-if="nudges.length"
            class="space-y-3"
            :aria-label="t('training.home.to-do')"
          >
            <li
              v-for="n in nudges"
              :key="n.id"
            >
              <UAlert
                :color="n.tone"
                variant="outline"
                :icon="n.icon"
                :title="n.title"
                :description="n.description"
                :actions="[{ label: n.action.label, to: n.action.to, color: 'neutral', variant: 'outline' }]"
                orientation="horizontal"
              />
            </li>
          </ul>
          <PageSection
            v-if="d.records.length"
            :title="t('training.home.held')"
          >
            <RecordList :label="t('training.home.held')">
              <RecordListItem
                v-for="r in d.records"
                :key="r.id"
                :to="course(r.slug)"
                icon="i-lucide-award"
                :name="r.courseTitle"
                :description="expiry(r)"
              >
                <TrainingStatusBadge :status="r.myStatus" />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <div class="flex flex-wrap gap-3">
            <UButton
              to="/members/training/mine"
              color="neutral"
              variant="outline"
              icon="i-lucide-folder-check"
              :label="t('training.mine.title')"
            />
          </div>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
