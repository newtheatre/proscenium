<!-- A question type's icon. The names are written here, in a component, so the icon bundle finds
     them: it reads components and pages, and nothing loads from a third party. -->
<script lang="ts">
import type { QuestionType } from '../../shared/engine'

export const FORMS_QUESTION_ICONS: Record<QuestionType, string> = {
  'text.short': 'i-lucide-type', 'text.long': 'i-lucide-align-left', 'email': 'i-lucide-at-sign', 'phone': 'i-lucide-phone', 'url': 'i-lucide-link',
  'number': 'i-lucide-hash', 'money': 'i-lucide-pound-sterling', 'date': 'i-lucide-calendar', 'time': 'i-lucide-clock', 'datetime': 'i-lucide-calendar-clock',
  'choice.single': 'i-lucide-circle-dot', 'choice.multiple': 'i-lucide-square-check', 'choice.dropdown': 'i-lucide-chevrons-up-down', 'choice.ranking': 'i-lucide-list-ordered',
  'yesno': 'i-lucide-toggle-left', 'rating': 'i-lucide-star', 'scale': 'i-lucide-sliders-horizontal', 'address': 'i-lucide-map-pin', 'file': 'i-lucide-paperclip',
  'consent': 'i-lucide-check-check', 'record': 'i-lucide-database',
}
</script>

<script setup lang="ts">
defineProps<{ type: QuestionType }>()
</script>

<template>
  <UIcon :name="FORMS_QUESTION_ICONS[type]" />
</template>
