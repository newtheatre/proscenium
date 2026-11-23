<!-- The palette: every kind of question, a block of text and a repeating group. On a page it also
     offers the two things few forms need, an ending and a calculation, under More. -->
<script setup lang="ts">
import type { QuestionType } from '../../shared/engine'

const props = withDefaults(defineProps<{ questionsOnly?: boolean, label?: string }>(), { questionsOnly: false, label: undefined })
const emit = defineEmits<{ add: [kind: QuestionType | 'content' | 'group'], more: [kind: 'ending' | 'calculation'] }>()
const { t } = useT()
// Once a kind is chosen the menu does not take focus back: the canvas sends it to the new item's wording.
let chosen = false
function pick(kind: QuestionType | 'content' | 'group') {
  chosen = true
  emit('add', kind)
}
function extra(kind: 'ending' | 'calculation') {
  chosen = true
  emit('more', kind)
}
function closed(event: Event) {
  if (chosen) event.preventDefault()
  chosen = false
}
const items = computed(() => [
  ...FORMS_PALETTE.map(g => [
    { type: 'label' as const, label: t(`forms.screens.palette.${g.group}`) },
    ...g.types.map(type => ({ label: t(`forms.types.${type}.label`), icon: formsQuestionIcon(type), onSelect: () => pick(type) })),
  ]),
  ...(props.questionsOnly
    ? []
    : [[
        { type: 'label' as const, label: t('forms.screens.palette.layout') },
        { label: t('forms.screens.palette.content'), icon: 'i-lucide-text', onSelect: () => pick('content') },
        { label: t('forms.screens.palette.group'), icon: 'i-lucide-repeat', onSelect: () => pick('group') },
      ], [
        { type: 'label' as const, label: t('forms.screens.palette.more') },
        { label: t('forms.screens.palette.ending'), icon: 'i-lucide-circle-slash', onSelect: () => extra('ending') },
        { label: t('forms.screens.palette.calculation'), icon: 'i-lucide-calculator', onSelect: () => extra('calculation') },
      ]]),
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', onCloseAutoFocus: closed }"
    :ui="{ content: 'w-[38rem] max-w-[calc(100vw-1rem)] max-h-[min(36rem,var(--reka-dropdown-menu-content-available-height))]', viewport: 'grid grid-cols-2 gap-x-1 divide-y-0 sm:grid-cols-3' }"
  >
    <UButton
      :label="label ?? t('forms.screens.builder.add')"
      icon="i-lucide-plus"
      color="neutral"
      variant="subtle"
    />
  </UDropdownMenu>
</template>
