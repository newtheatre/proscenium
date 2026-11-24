<!-- The palette above the grid: Free, Maybe, Busy or Clear, and, once the person has a pattern, whether a
     stroke on a pattern day changes just those days or the pattern (W1). -->
<script setup lang="ts">
import { LEVELS } from '../../shared/levels'
import type { Target, Tool } from '../composables/useMyAvailability'

defineProps<{ patterns: boolean }>()
const tool = defineModel<Tool>('tool', { required: true })
const target = defineModel<Target | null>('target', { required: true })
const { t } = useT()

const TOOLS = computed(() => [...LEVELS, 'clear' as const].map(value => ({ value, label: t(`availability.tools.${value}`) })))
const TARGETS = computed(() => [
  { value: 'days', label: t('availability.mine.target-days') },
  { value: 'pattern', label: t('availability.mine.target-pattern') },
])
</script>

<template>
  <UFormField
    :label="t('availability.mine.paint')"
    orientation="horizontal"
  >
    <UTabs
      v-model="tool"
      :items="TOOLS"
      :content="false"
      size="sm"
    />
  </UFormField>
  <UFormField
    v-if="patterns"
    :label="t('availability.mine.target')"
    orientation="horizontal"
  >
    <USelect
      :model-value="target ?? undefined"
      :items="TARGETS"
      :placeholder="t('availability.mine.target-ask')"
      class="w-44"
      @update:model-value="target = $event as Target"
    />
  </UFormField>
</template>
