<!-- M9 Sign someone off (training-records part 5; TR-05): course (only ones I train), person, the
     practical steps with how many times each is done, the day and a note. One tap, with Undo. -->
<script setup lang="ts">
import type { Teaching } from '../../../../../server/teaching'

const { t } = useT()
const route = useRoute()
const { data, status, error, refresh } = await useAPI<Teaching>('/api/training/teaching', { key: 'training:teaching' })
const startCourse = typeof route.query.course === 'string' ? route.query.course : undefined
const { form, person, courses, courseItems, stepItems, submitLabel, refusal, validate, submit } = useSignOffForm(data, startCourse)

const trail = computed(() => [
  { label: t('training.navigation.home.label'), to: '/members/training' },
  { label: t('training.navigation.teach.label'), to: '/members/training/teaching' },
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
        :title="t('training.teaching.sign-off')"
        :trail="trail"
        width="reading"
      >
        <EmptyState
          v-if="!courses.length"
          icon="i-lucide-badge-check"
          :title="t('training.sign-off.none.title')"
          :description="t('training.sign-off.none.description')"
        />
        <UForm
          v-else
          :state="form"
          :validate="validate"
          class="space-y-6"
          novalidate
          @submit="submit"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('training.sign-off.course')"
            :help="t('training.sign-off.course-help')"
            name="courseId"
            required
          >
            <USelect
              v-model="form.courseId"
              :items="courseItems"
              :placeholder="t('training.sign-off.course-placeholder')"
            />
          </UFormField>
          <UFormField
            :label="t('training.sign-off.person')"
            name="accountId"
            required
          >
            <PersonPicker
              v-model="form.accountId"
              endpoint="/api/training/teaching/people"
              @picked="p => person = p?.name ?? p?.label ?? null"
            />
          </UFormField>
          <UFormField
            v-if="form.courseId"
            :label="t('training.sign-off.steps')"
            name="steps"
            required
          >
            <UCheckboxGroup
              v-model="form.steps"
              :items="stepItems"
              size="xl"
            />
          </UFormField>
          <UFormField
            :label="t('training.sign-off.day')"
            name="occurredOn"
            required
          >
            <FieldDate
              v-model="form.occurredOn"
              :max="d.today"
            />
          </UFormField>
          <UFormField
            :label="t('training.sign-off.note')"
            name="note"
          >
            <UTextarea
              v-model="form.note"
              :rows="2"
              :maxlength="500"
            />
          </UFormField>
          <UButton
            type="submit"
            size="xl"
            block
            icon="i-lucide-badge-check"
            :label="submitLabel"
            loading-auto
          />
        </UForm>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
