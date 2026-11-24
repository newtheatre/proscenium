<!-- Where a person stands on a course, as a badge that always carries a word. -->
<script setup lang="ts">
import type { MyStatus } from '../../server/learner'

const props = defineProps<{ status: MyStatus, done?: number, of?: number }>()
const { status: word } = useTrainingWords()
const badge = computed(() => word(props.status, props.done, props.of))
</script>

<template>
  <StatusBadge
    :tone="badge.tone"
    :label="badge.label"
  />
</template>
