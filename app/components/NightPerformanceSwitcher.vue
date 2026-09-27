<script setup lang="ts">
import { saysPerformanceChoice } from '#shared/utils/tonight'

// One tap to the house you are working, on a matinee day (E-127 criterion 2), one row under the
// other so no house hides off the edge (issue 1317). Rendered only where there is a choice.
defineProps<{
  performances: { performanceId: string, showTitle: string, startsAt: number }[]
  selectedId: string | null
}>()

const emit = defineEmits<{ choose: [performanceId: string] }>()
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-test="performance-switcher"
  >
    <UButton
      v-for="performance in performances"
      :key="performance.performanceId"
      block
      class="min-h-12 justify-start"
      :color="performance.performanceId === selectedId ? 'primary' : 'neutral'"
      :variant="performance.performanceId === selectedId ? 'solid' : 'subtle'"
      :data-test="`choose-${performance.performanceId}`"
      @click="emit('choose', performance.performanceId)"
    >
      {{ saysPerformanceChoice(performance) }}
    </UButton>
  </div>
</template>
