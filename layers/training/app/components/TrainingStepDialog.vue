<!-- One step in K2's step editor: its kind (chosen when it is added), title, whether it counts for a
     first award, a renewal or both, and the fields its kind needs. A saved step can be marked as
     changed, so sign-offs for it stop counting (V3). -->
<script setup lang="ts">
import { NEEDED_FOR, STEP_KINDS } from '../../shared/states'
import type { StepDraft } from '../composables/useStepEditor'

export interface StepChoices { quizForms: { id: string, title: string }[], declarationForms: { id: string, title: string }[], sources: { id: string, label: string, picker: string | null }[] }

const props = defineProps<{ step: StepDraft | null, choices: StepChoices }>()
const emit = defineEmits<{ done: [step: StepDraft], close: [] }>()
const { t } = useT()
const { kindLabel } = useStepWords()
const form = ref<StepDraft | null>(null)
watch(() => props.step, (s) => { form.value = s ? structuredClone(toRaw(s)) : null }, { immediate: true })
const kinds = STEP_KINDS.map(value => ({ value, label: kindLabel(value) }))
const neededFor = computed(() => NEEDED_FOR.map(value => ({ value, label: t(`training.needed-for.${value}`) })))

function validate() {
  const f = form.value
  if (!f) return []
  return needs({
    title: f.title.trim(),
    ...(f.kind === 'quiz' ? { formId: f.formId } : {}),
    ...(f.kind === 'activity' ? { sourceId: f.sourceId } : {}),
  })
}
</script>

<template>
  <UModal
    :open="!!form"
    :title="t(step?.id ? 'training.step-editor.edit' : 'training.step-editor.add')"
    @update:open="v => { if (!v) emit('close') }"
  >
    <template #body>
      <UForm
        v-if="form"
        id="training-step-form"
        class="space-y-4"
        :state="form"
        :validate="validate"
        novalidate
        @submit="emit('done', form)"
      >
        <UFormField
          name="kind"
          :label="t('training.step-editor.kind')"
          :help="form.id ? t('training.step-editor.kind-fixed') : undefined"
          required
        >
          <USelect
            v-model="form.kind"
            :items="kinds"
            :disabled="!!form.id"
          />
        </UFormField>
        <UFormField
          name="title"
          :label="t('training.step-editor.title')"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="120"
          />
        </UFormField>
        <TrainingStepKindFields
          v-model="form"
          :choices="choices"
        />
        <UFormField
          :label="t('training.step-editor.needed-for')"
          :help="t('training.step-editor.needed-for-help')"
        >
          <USelect
            v-model="form.neededFor"
            :items="neededFor"
          />
        </UFormField>
        <UCheckbox
          v-if="form.id"
          v-model="form.changed"
          :label="t('training.step-editor.changed')"
          :description="t('training.step-editor.changed-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('training.course-form.cancel')"
          @click="emit('close')"
        />
        <UButton
          type="submit"
          form="training-step-form"
          :label="t('training.step-editor.keep')"
        />
      </div>
    </template>
  </UModal>
</template>
