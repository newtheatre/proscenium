<!-- A question's correct answer, points and feedback (FB-513), in the builder's details panel. Shown
     only on a marked form, to somebody who may mark it, for a question that can be marked. -->
<script setup lang="ts">
import { DEFAULT_POINTS, type AnswerKey, type Question } from '../../shared/engine'

const props = defineProps<{ question: Question }>()
const emit = defineEmits<{ 'update:answer': [answer: AnswerKey | undefined, field?: string] }>()
const { t } = useT()

const key = computed(() => props.question.answer)
const options = computed(() => (props.question.options ?? []).map((o, i) => ({ value: o.id, label: o.label.trim() || t('forms.screens.options.label', { n: i + 1 }) })))
const several = computed(() => props.question.type === 'choice.multiple' || (props.question.type === 'choice.dropdown' && !!props.question.multiple))
const chosen = computed(() => Array.isArray(key.value?.correct) ? key.value.correct : [])
const range = computed(() => key.value && typeof key.value.correct === 'object' && !Array.isArray(key.value.correct) ? key.value.correct : {})

/** Sets what is right; clearing it removes the whole key, points and feedback with it. */
function setCorrect(correct: AnswerKey['correct'] | undefined, field?: string) {
  const empty = correct === undefined || (Array.isArray(correct) && !correct.length) || (typeof correct === 'object' && !Array.isArray(correct) && correct.min === undefined && correct.max === undefined)
  emit('update:answer', empty ? undefined : { ...key.value, correct: correct! }, field)
}
function setPoints(points: number | null | undefined) {
  if (!key.value) return
  const { points: _was, ...rest } = key.value
  emit('update:answer', points === null || points === undefined || points === DEFAULT_POINTS ? rest : { ...rest, points }, 'points')
}
function setFeedback(which: 'right' | 'wrong', words: string) {
  if (!key.value) return
  const feedback = { ...key.value.feedback, [which]: words }
  if (!words.trim()) Reflect.deleteProperty(feedback, which)
  const { feedback: _was, ...rest } = key.value
  emit('update:answer', Object.keys(feedback).length ? { ...rest, feedback } : rest, `feedback-${which}`)
}
const bound = (v: number | null | undefined) => v === null || v === undefined || Number.isNaN(v) ? undefined : v
const truth = computed(() => typeof key.value?.correct === 'boolean' ? String(key.value.correct) : undefined)
</script>

<template>
  <div class="space-y-3">
    <UFormField
      v-if="question.type === 'yesno'"
      :label="t('forms.screens.answer-key.correct')"
    >
      <URadioGroup
        :model-value="truth"
        orientation="horizontal"
        :items="[{ value: 'true', label: t('forms.screens.logic.yes') }, { value: 'false', label: t('forms.screens.logic.no') }]"
        @update:model-value="setCorrect($event === 'true')"
      />
    </UFormField>
    <UFormField
      v-else-if="question.type === 'number'"
      :label="t('forms.screens.answer-key.correct')"
      :help="t('forms.screens.answer-key.range-help')"
    >
      <div class="grid grid-cols-2 gap-2">
        <FieldNumber
          :model-value="range.min"
          :placeholder="t('forms.screens.answer-key.from')"
          :aria-label="t('forms.screens.answer-key.from')"
          @update:model-value="setCorrect({ ...range, min: bound($event) }, 'min')"
        />
        <FieldNumber
          :model-value="range.max"
          :placeholder="t('forms.screens.answer-key.to')"
          :aria-label="t('forms.screens.answer-key.to')"
          @update:model-value="setCorrect({ ...range, max: bound($event) }, 'max')"
        />
      </div>
    </UFormField>
    <UFormField
      v-else-if="question.type === 'text.short'"
      :label="t('forms.screens.answer-key.accepted')"
      :help="t('forms.screens.answer-key.accepted-help')"
    >
      <UInputTags
        :model-value="chosen"
        :max-length="300"
        @update:model-value="setCorrect($event as string[], 'accepted')"
      />
    </UFormField>
    <UFormField
      v-else-if="several"
      :label="t('forms.screens.answer-key.correct-several')"
    >
      <UCheckboxGroup
        :model-value="chosen"
        :items="options"
        @update:model-value="setCorrect($event as string[])"
      />
    </UFormField>
    <UFormField
      v-else
      :label="t('forms.screens.answer-key.correct')"
    >
      <USelect
        :model-value="chosen[0]"
        :items="options"
        :placeholder="t('forms.screens.answer-key.choose')"
        @update:model-value="setCorrect($event ? [$event as string] : undefined)"
      />
    </UFormField>

    <template v-if="key">
      <UFormField
        :label="t('forms.screens.answer-key.points')"
        :help="t('forms.screens.answer-key.points-help')"
      >
        <FieldNumber
          :model-value="key.points ?? DEFAULT_POINTS"
          :min="0"
          :max="100"
          :step="1"
          @update:model-value="setPoints($event)"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.answer-key.feedback-right')"
        :hint="t('forms.screens.details.optional')"
      >
        <UTextarea
          :model-value="key.feedback?.right ?? ''"
          :rows="2"
          autoresize
          maxlength="500"
          @update:model-value="setFeedback('right', String($event ?? ''))"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.answer-key.feedback-wrong')"
        :hint="t('forms.screens.details.optional')"
      >
        <UTextarea
          :model-value="key.feedback?.wrong ?? ''"
          :rows="2"
          autoresize
          maxlength="500"
          @update:model-value="setFeedback('wrong', String($event ?? ''))"
        />
      </UFormField>
    </template>
  </div>
</template>
