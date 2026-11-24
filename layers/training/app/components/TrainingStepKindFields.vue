<!-- The fields one kind of step needs in the step editor: material for in-person steps, how many times
     for repeated ones, the activity that counts, what evidence is asked for, and the form a quiz or a
     declaration uses (attached to the course on its Forms tab). A lesson's sections are written apart. -->
<script setup lang="ts">
import { EVIDENCE_EXPIRY, EVIDENCE_FILE, SHOW_ANSWERS } from '../../shared/states'
import type { StepDraft } from '../composables/useStepEditor'
import type { StepChoices } from './TrainingStepDialog.vue'

const props = defineProps<{ choices: StepChoices }>()
const draft = defineModel<StepDraft>({ required: true })
const { t } = useT()
const options = (list: readonly string[], prefix: string) => list.map(value => ({ value, label: t(`${prefix}.${value}`) }))
const formItems = (forms: { id: string, title: string }[]) => forms.map(f => ({ value: f.id, label: f.title }))
const source = computed(() => draft.value.kind === 'activity' ? props.choices.sources.find(s => s.id === draft.value.sourceId) : undefined)
const picker = computed(() => {
  const name = source.value?.picker
  if (!name) return null
  const found = resolveComponent(name)
  return typeof found === 'string' ? null : found
})
const material = computed(() => ['session', 'practical', 'reading'].includes(draft.value.kind))
const repeated = computed(() => ['practical', 'activity'].includes(draft.value.kind))
const addQualification = () => draft.value.qualifications.push({ title: '', issuers: '' })
</script>

<template>
  <div class="space-y-4">
    <UFormField
      v-if="draft.kind !== 'lesson'"
      :label="t('training.step-editor.guidance')"
      :help="t('training.step-editor.guidance-help')"
    >
      <UTextarea
        v-model="draft.guidance"
        :rows="3"
        maxlength="2000"
      />
    </UFormField>
    <p
      v-else
      class="text-sm text-muted"
    >
      {{ t('training.step-editor.lesson-help') }}
    </p>
    <UFormField
      v-if="material"
      :label="t('training.step-editor.material')"
      :help="t('training.step-editor.material-help')"
    >
      <UInput
        v-model="draft.materialUrl"
        type="url"
        maxlength="500"
      />
    </UFormField>
    <UFormField
      v-if="repeated"
      :label="t('training.step-editor.times')"
    >
      <FieldNumber
        v-model="draft.timesRequired"
        :min="1"
        :max="20"
      />
    </UFormField>
    <template v-if="draft.kind === 'activity'">
      <UFormField
        name="sourceId"
        :label="t('training.step-editor.source')"
        required
      >
        <USelect
          v-model="draft.sourceId"
          :items="choices.sources.map(s => ({ value: s.id, label: t(s.label) }))"
          :placeholder="t('training.step-editor.source-placeholder')"
        />
      </UFormField>
      <component
        :is="picker"
        v-if="picker"
        v-model="draft.sourceParams"
      />
    </template>
    <template v-if="draft.kind === 'certificate' || draft.kind === 'declaration'">
      <UFormField
        v-if="draft.kind === 'certificate'"
        :label="t('training.step-editor.evidence-expiry')"
      >
        <USelect
          v-model="draft.evidenceExpiry"
          :items="options(EVIDENCE_EXPIRY, 'training.evidence-expiry')"
        />
      </UFormField>
      <UFormField :label="t('training.step-editor.evidence-file')">
        <USelect
          v-model="draft.evidenceFile"
          :items="options(EVIDENCE_FILE, 'training.evidence-file')"
        />
      </UFormField>
    </template>
    <template v-if="draft.kind === 'certificate'">
      <FieldGroup
        :title="t('training.step-editor.qualifications')"
        :description="t('training.step-editor.qualifications-help')"
      >
        <div
          v-for="(q, i) in draft.qualifications"
          :key="i"
          class="grid gap-2 sm:grid-cols-2"
        >
          <UInput
            v-model="q.title"
            :aria-label="t('training.step-editor.qualification', { number: i + 1 })"
            :placeholder="t('training.step-editor.qualification-placeholder')"
          />
          <UInput
            v-model="q.issuers"
            :aria-label="t('training.step-editor.issuers', { number: i + 1 })"
            :placeholder="t('training.step-editor.issuers-placeholder')"
          />
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          :label="t('training.step-editor.add-qualification')"
          @click="addQualification"
        />
      </FieldGroup>
      <UCheckbox
        v-model="draft.otherQualification"
        :label="t('training.step-editor.other-qualification')"
      />
    </template>
    <UFormField
      v-if="draft.kind === 'quiz' || draft.kind === 'declaration'"
      name="formId"
      :label="t(draft.kind === 'quiz' ? 'training.step-editor.quiz-form' : 'training.step-editor.declaration-form')"
      :help="t(draft.kind === 'quiz' ? 'training.step-editor.quiz-form-help' : 'training.step-editor.declaration-form-help')"
      :required="draft.kind === 'quiz'"
    >
      <USelect
        v-model="draft.formId"
        :items="formItems(draft.kind === 'quiz' ? choices.quizForms : choices.declarationForms)"
        :placeholder="t('training.step-editor.form-placeholder')"
      />
    </UFormField>
    <template v-if="draft.kind === 'quiz'">
      <UFormField
        :label="t('training.step-editor.attempts')"
        :help="t('training.step-editor.attempts-help')"
      >
        <FieldNumber
          v-model="draft.maxAttempts"
          :min="1"
          :max="20"
        />
      </UFormField>
      <UFormField :label="t('training.step-editor.show-answers')">
        <USelect
          v-model="draft.showAnswers"
          :items="options(SHOW_ANSWERS, 'training.show-answers')"
        />
      </UFormField>
    </template>
  </div>
</template>
