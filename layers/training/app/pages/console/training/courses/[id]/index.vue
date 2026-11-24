<!-- K2 A course (training-records part 5, "Console"): the state as a badge, the live version, how long
     training lasts, holders, those lapsing soon and the next session above the tabs Steps, Versions,
     Trainers and the forms its quizzes and declarations use. Publish while a version is in preparation; otherwise "Edit steps" starts the next. -->
<script setup lang="ts">
import type { CourseView } from '../../../../../composables/useCourseRecord'

definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<CourseView>(() => `/api/training/courses/${encodeURIComponent(id.value)}`, { key: `training:console-course:${id.value}` })
const { refusal, editing, publishing, primary, onPrimary, actions, summary, recordStatus } = useCourseRecord(id, data, refresh)

const trail = computed(() => [{ label: t('training.navigation.courses.label'), to: '/console/training/courses' }])
const tabs = computed(() => [
  { id: 'steps', label: t('training.course-record.tab.steps') },
  { id: 'versions', label: t('training.course-record.tab.versions') },
  { id: 'trainers', label: t('training.course-record.tab.trainers') },
  ...(data.value?.actions.manage ? [{ id: 'forms', label: t('training.course-record.tab.forms') }] : []),
])
const shown = computed(() => data.value?.preparing
  ? { steps: data.value.preparing.steps, label: t('training.course-record.preparing', { number: data.value.preparing.version.number }) }
  : { steps: data.value?.live ?? [], label: t('training.course-record.live-steps') })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="d.course.title"
        :status="recordStatus"
        :primary="primary"
        :actions="actions"
        :summary="summary"
        record-type="training.course"
        :record-id="d.course.id"
        :tabs="tabs"
        :trail="trail"
        @primary="onPrimary"
      >
        <template #tab-steps>
          <div class="space-y-4">
            <RefusalNotice :refusal="refusal" />
            <p
              v-if="d.course.summary"
              class="text-muted"
            >
              {{ d.course.summary }}
            </p>
            <PageSection :title="shown.label">
              <TrainingStepList
                v-if="shown.steps.length"
                :steps="shown.steps"
                :label="shown.label"
              />
              <EmptyState
                v-else
                icon="i-lucide-list-ordered"
                :title="t('training.course-record.no-steps-title')"
                :description="t('training.course-record.no-steps-description')"
              />
            </PageSection>
          </div>
        </template>
        <template #tab-versions>
          <TrainingVersionList :versions="d.versions" />
        </template>
        <template #tab-trainers>
          <TrainingTrainers
            :course-id="d.course.id"
            :trainers="d.trainers"
            :manage="d.actions.manage"
            @changed="refresh()"
          />
        </template>
        <template #tab-forms>
          <div class="space-y-8">
            <p class="text-sm text-muted">
              {{ t('training.course-record.forms-help') }}
            </p>
            <PageSection :title="t('training.forms.quiz.label')">
              <FormsSlotForms
                slot-id="training.quiz"
                :subject="d.course.id"
              />
            </PageSection>
            <PageSection :title="t('training.forms.declaration.label')">
              <FormsSlotForms
                slot-id="training.declaration"
                :subject="d.course.id"
              />
            </PageSection>
          </div>
        </template>
      </PageRecord>
      <TrainingCourseDialog
        v-model:open="editing"
        :course="d.course"
        @saved="refresh()"
      />
      <TrainingPublishDialog
        v-if="d.preparing"
        v-model:open="publishing"
        :course-id="d.course.id"
        :number="d.preparing.version.number"
        :holders="d.overview?.holders ?? 0"
        @published="refresh()"
      />
    </template>
  </DataBoundary>
</template>
