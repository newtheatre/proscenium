<!-- The palette: every kind of question, a block of text and a repeating group. -->
<script setup lang="ts">
import type { QuestionType } from '../../shared/engine'

const props = withDefaults(defineProps<{ questionsOnly?: boolean, label?: string }>(), { questionsOnly: false, label: undefined })
const emit = defineEmits<{ add: [kind: QuestionType | 'content' | 'group'] }>()
const { t } = useT()
// Once a kind is chosen the menu does not take focus back: it goes to the new item's first field,
// so its wording can be typed straight away.
let chosen = false
function pick(kind: QuestionType | 'content' | 'group') {
  chosen = true
  emit('add', kind)
}
function closed(event: Event) {
  if (!chosen) return
  chosen = false
  const field = [...document.querySelectorAll<HTMLElement>('[data-forms-details] :is(textarea, input)')].find(el => el.offsetParent !== null)
  if (!field) return
  event.preventDefault()
  field.focus()
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
