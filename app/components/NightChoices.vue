<script setup lang="ts" generic="T extends string">
// A night sheet's choice, as tiles rather than a dropdown (issue 1317): 48 pixels each, two
// across, the chosen one solid, and the first carries the sheet's opening focus.
const model = defineModel<T | null>({ required: true })

defineProps<{
  label: string
  options: readonly { value: T, label: string }[]
  testId: string
  columns?: 1 | 2 | 3
}>()

const GRID = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' } as const
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="text-sm font-medium">
      {{ label }}
    </legend>
    <div
      class="grid gap-2"
      :class="GRID[columns ?? 2]"
      :data-test="testId"
    >
      <UButton
        v-for="(option, index) in options"
        :key="option.value"
        :color="model === option.value ? 'primary' : 'neutral'"
        :variant="model === option.value ? 'solid' : 'subtle'"
        size="lg"
        class="min-h-12 justify-center"
        :aria-pressed="model === option.value"
        :data-sheet-first="index === 0 ? '' : undefined"
        :data-test="`${testId}-${option.value}`"
        @click="model = option.value"
      >
        {{ option.label }}
      </UButton>
    </div>
  </fieldset>
</template>
