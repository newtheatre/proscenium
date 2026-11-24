<!-- What a person is told of their marked answers once they have sent them (FB-513, MK4): the score,
     whether they passed, and feedback and the right answers where the form says to show them. -->
<script setup lang="ts">
import type { ShownMarking } from '../../shared/engine'

defineProps<{ marking: ShownMarking }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-lg font-semibold text-highlighted">
        {{ t('forms.screens.marking.scored', { score: marking.score, outOf: marking.outOf }) }}
      </p>
      <UBadge
        v-if="marking.passed !== null"
        :color="marking.passed ? 'success' : 'neutral'"
        variant="subtle"
        :icon="marking.passed ? 'i-lucide-circle-check' : 'i-lucide-circle-minus'"
        :label="t(marking.passed ? 'forms.screens.marking.passed' : 'forms.screens.marking.not-passed')"
      />
    </div>
    <RecordList
      v-if="marking.questions.length"
      :label="t('forms.screens.marking.questions')"
    >
      <RecordListItem
        v-for="q in marking.questions"
        :key="q.questionId"
        :name="q.label"
        :description="q.feedback"
        align="start"
      >
        <template #leading>
          <UIcon
            :name="q.correct ? 'i-lucide-check' : 'i-lucide-x'"
            :class="q.correct ? 'text-success' : 'text-error'"
            class="size-5 shrink-0"
          />
          <span class="sr-only">{{ t(q.correct ? 'forms.screens.marking.right' : 'forms.screens.marking.wrong') }}</span>
        </template>
        <template
          v-if="q.answer !== undefined && !q.correct"
          #below
        >
          <p class="text-sm">
            {{ t('forms.screens.marking.answer', { answer: q.answer }) }}
          </p>
        </template>
      </RecordListItem>
    </RecordList>
  </div>
</template>
