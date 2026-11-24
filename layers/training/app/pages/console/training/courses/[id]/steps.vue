<!-- K2's step editor (TR-02): the steps of the version in preparation, in order, each opened in a
     dialogue to change. Drag a step by its handle or use its menu to move it. Nothing is saved until
     "Save steps"; publishing stays on the course. -->
<script setup lang="ts">
import type { CourseView } from '../../../../../composables/useCourseRecord'
import { newDraft, useStepEditor, type StepDraft } from '../../../../../composables/useStepEditor'
import type { StepChoices } from '../../../../../components/TrainingStepDialog.vue'

definePageMeta({ layout: 'console' })

interface Slot { attached: { formId: string, title: string }[] }

const { t } = useT()
const { describe } = useStepWords()
const route = useRoute()
const id = computed(() => String(route.params.id))
const coursePath = computed(() => `/console/training/courses/${encodeURIComponent(id.value)}`)
const { data, status, error, refresh } = await useAPI<CourseView>(() => `/api/training/courses/${encodeURIComponent(id.value)}`, { key: `training:console-course:${id.value}` })
const slot = (name: string) => useAPI<Slot>(`/api/forms/slots/${name}/${encodeURIComponent(id.value)}`, { key: `training:slot:${name}:${id.value}`, default: () => ({ attached: [] }) })
const [quiz, declaration, sources] = await Promise.all([
  slot('training.quiz'),
  slot('training.declaration'),
  useAPI<{ sources: StepChoices['sources'] }>('/api/training/step-sources', { key: 'training:step-sources', default: () => ({ sources: [] }) }),
])
const choices = computed<StepChoices>(() => ({
  quizForms: (quiz.data.value?.attached ?? []).map(a => ({ id: a.formId, title: a.title })),
  declarationForms: (declaration.data.value?.attached ?? []).map(a => ({ id: a.formId, title: a.title })),
  sources: sources.data.value?.sources ?? [],
}))
const steps = computed(() => data.value?.preparing?.steps ?? [])
const { drafts, refusal, saving, editing, put, move, remove, save } = useStepEditor(id, steps)
const trail = computed(() => [
  { label: t('training.navigation.courses.label'), to: '/console/training/courses' },
  { label: data.value?.course.title ?? '', to: coursePath.value },
])

function done(step: StepDraft) {
  put(step)
  editing.value = null
}
// The course page shares this page's data, so it is read again before going back to it.
async function saveAll() {
  if (!await save()) return
  await refresh()
  await navigateTo(coursePath.value)
}
const rowActions = (d: StepDraft, i: number) => [
  [
    { label: t('training.step-editor.edit'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = d } },
    { label: t('training.step-editor.up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => move(i, i - 1) },
    { label: t('training.step-editor.down'), icon: 'i-lucide-arrow-down', disabled: i === drafts.value.length - 1, onSelect: () => move(i, i + 1) },
  ],
  [{ label: t('training.step-editor.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(d.key) }],
]
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
        :title="t('training.step-editor.page', { number: d.preparing?.version.number ?? '' })"
        :trail="trail"
      >
        <template #primary>
          <UButton
            v-if="d.preparing"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!drafts.length"
            :label="t('training.step-editor.save')"
            @click="saveAll"
          />
        </template>
        <EmptyState
          v-if="!d.preparing"
          icon="i-lucide-list-ordered"
          :title="t('training.step-editor.none.title')"
          :description="t('training.step-editor.none.description')"
        />
        <div
          v-else
          class="space-y-4"
        >
          <RefusalNotice :refusal="refusal" />
          <SortableList
            v-if="drafts.length"
            :label="t('training.course-record.tab.steps')"
            @reorder="m => move(m.from, m.to)"
          >
            <SortableRow
              v-for="(s, i) in drafts"
              :id="s.key"
              :key="s.key"
              :index="i"
              :name="`${i + 1}. ${s.title}`"
              :description="describe(s)"
            >
              <template #leading>
                <IconButton
                  :data-drag-handle="s.key"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="t('training.step-editor.handle', { title: s.title })"
                />
              </template>
              <RowActions
                :label="t('training.step-editor.actions', { title: s.title })"
                :items="rowActions(s, i)"
              />
            </SortableRow>
          </SortableList>
          <EmptyState
            v-else
            icon="i-lucide-list-plus"
            :title="t('training.step-editor.empty.title')"
            :description="t('training.step-editor.empty.description')"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('training.step-editor.add')"
            @click="editing = newDraft()"
          />
        </div>
        <TrainingStepDialog
          :step="editing"
          :choices="choices"
          @done="done"
          @close="editing = null"
        />
      </PageFrame>
    </template>
  </DataBoundary>
</template>
