<!-- A question as it shows on the canvas: its type, its words, whether it is required, its options
     in brief, the sentence that decides when it is shown, and anything wrong with it. -->
<script setup lang="ts">
import type { Question } from '../../shared/engine'

defineProps<{ question: Question, logic: string }>()
const { t } = useT()
const MOST_SHOWN = 4 // not-policy: options listed on a card before "and n more"
</script>

<template>
  <p class="flex items-center gap-1.5 text-xs font-medium text-muted">
    <UIcon :name="formsQuestionIcon(question.type)" />{{ t(`forms.types.${question.type}.label`) }}
    <UBadge
      v-if="question.required"
      size="sm"
      color="neutral"
      variant="subtle"
      :label="t(question.required === true ? 'forms.screens.builder.required' : 'forms.screens.builder.required-sometimes')"
    />
  </p>
  <p
    class="mt-1 font-medium"
    :class="question.label.trim() ? '' : 'text-dimmed'"
  >
    {{ formsQuestionName(question) }}
  </p>
  <p
    v-if="question.help"
    class="text-sm text-muted"
  >
    {{ question.help }}
  </p>
  <p
    v-if="question.options?.length"
    class="mt-1 text-sm text-muted"
  >
    {{ question.options.slice(0, MOST_SHOWN).map(o => o.label || '…').join(' · ') }}
    <template v-if="question.options.length > MOST_SHOWN">
      {{ t('forms.screens.builder.more-options', { count: question.options.length - MOST_SHOWN }) }}
    </template>
  </p>
  <p
    v-if="logic"
    class="mt-1 flex items-start gap-1 text-xs text-muted"
  >
    <UIcon
      name="i-lucide-git-branch"
      class="mt-0.5 shrink-0"
    />{{ logic }}
  </p>
  <FormsProblemBadge :at="question.id" />
</template>
