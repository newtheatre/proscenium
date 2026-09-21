<script setup lang="ts">
import { saysPerformanceChoice } from '#shared/utils/tonight'

// One tap to the house you are working, on a matinee day (E-127 criterion 2). A single performance
// has nothing to switch between, so the caller renders this only where there is a choice.
defineProps<{
  performances: { performanceId: string, showTitle: string, startsAt: number }[]
  selectedId: string | null
}>()

const emit = defineEmits<{ choose: [performanceId: string] }>()
</script>

<template>
  <div
    class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    data-test="performance-switcher"
  >
    <UButton
      v-for="performance in performances"
      :key="performance.performanceId"
      size="sm"
      class="min-h-12 shrink-0"
      :color="performance.performanceId === selectedId ? 'primary' : 'neutral'"
      :variant="performance.performanceId === selectedId ? 'solid' : 'subtle'"
      :data-test="`choose-${performance.performanceId}`"
      @click="emit('choose', performance.performanceId)"
    >
      {{ saysPerformanceChoice(performance) }}
    </UButton>
  </div>
</template>
