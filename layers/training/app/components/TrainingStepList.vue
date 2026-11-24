<!-- K2's Steps tab: the steps of one version in order, each with its kind and how often it is needed. -->
<script setup lang="ts">
import type { Step } from '../../server/courses'

defineProps<{ steps: Step[], label: string }>()
const { describe } = useStepWords()
const ICON = { session: 'i-lucide-users', practical: 'i-lucide-hand', activity: 'i-lucide-calendar-check', reading: 'i-lucide-book-open', lesson: 'i-lucide-monitor-play', quiz: 'i-lucide-list-checks', certificate: 'i-lucide-file-badge', declaration: 'i-lucide-file-pen' } as const
</script>

<template>
  <RecordList :label="label">
    <RecordListItem
      v-for="(step, i) in steps"
      :key="step.id"
      :icon="ICON[step.kind]"
      :name="`${i + 1}. ${step.title}`"
      :description="describe(step)"
    />
  </RecordList>
</template>
