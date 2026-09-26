<script setup lang="ts">
import { describePurpose } from '#shared/utils/bookings'

// What a room is for, asked once as a row of chips (issue 1338, C-119). A closed set is buttons,
// not a select: a tap chooses it, and the chosen one is marked by more than its colour (K-101).

const props = defineProps<{ purposes: readonly string[], testPrefix: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div
    class="flex flex-wrap gap-2"
    role="group"
    :data-test="`${props.testPrefix}-purpose`"
  >
    <UButton
      v-for="purpose in purposes"
      :key="purpose"
      :color="model === purpose ? 'primary' : 'neutral'"
      :variant="model === purpose ? 'solid' : 'outline'"
      :aria-pressed="model === purpose"
      :icon="model === purpose ? 'i-lucide-check' : undefined"
      class="min-h-11"
      :data-test="`${props.testPrefix}-purpose-${purpose}`"
      @click="model = purpose"
    >
      {{ describePurpose(purpose) }}
    </UButton>
  </div>
</template>
