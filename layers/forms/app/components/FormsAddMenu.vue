<!-- The palette: every kind of question, a block of text and a repeating group. -->
<script setup lang="ts">
import type { QuestionType } from '../../shared/engine'

const props = withDefaults(defineProps<{ questionsOnly?: boolean, label?: string }>(), { questionsOnly: false, label: undefined })
const emit = defineEmits<{ add: [kind: QuestionType | 'content' | 'group'] }>()
const { t } = useT()
const items = computed(() => [
  ...FORMS_PALETTE.map(g => [
    { type: 'label' as const, label: t(`forms.screens.palette.${g.group}`) },
    ...g.types.map(type => ({ label: t(`forms.types.${type}.label`), icon: formsQuestionIcon(type), onSelect: () => emit('add', type) })),
  ]),
  ...(props.questionsOnly
    ? []
    : [[
        { type: 'label' as const, label: t('forms.screens.palette.layout') },
        { label: t('forms.screens.palette.content'), icon: 'i-lucide-text', onSelect: () => emit('add', 'content') },
        { label: t('forms.screens.palette.group'), icon: 'i-lucide-repeat', onSelect: () => emit('add', 'group') },
      ]]),
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :ui="{ content: 'max-h-96 overflow-y-auto' }"
  >
    <UButton
      :label="label ?? t('forms.screens.builder.add')"
      icon="i-lucide-plus"
      color="neutral"
      variant="subtle"
    />
  </UDropdownMenu>
</template>
