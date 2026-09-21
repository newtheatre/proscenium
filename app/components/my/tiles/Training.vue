<script setup lang="ts">
import { saysDay } from '#shared/utils/when'
import type { MySummary } from '#shared/utils/my-summary'

const props = defineProps<{ summary: MySummary }>()

const held = computed(() => props.summary.training.held)
const available = computed(() => props.summary.training.available)
const progressLine = computed(() => `${held.value} of ${plural(available.value, 'module')} held`)
</script>

<template>
  <MyTile
    title="Training"
    to="/training"
    label="See my training"
    :empty="held === 0 && available === 0 && !summary.training.nextStep"
    empty-title="Nothing recorded yet"
    empty-label="See what we teach"
    class="lg:row-span-2"
  >
    <p
      id="my-training-progress"
      class="text-sm text-muted"
    >
      {{ progressLine }}
    </p>
    <UProgress
      :model-value="held"
      :max="Math.max(available, 1)"
      aria-labelledby="my-training-progress"
      class="mt-2"
    />

    <div
      v-if="summary.training.nextSession"
      class="mt-4"
    >
      <p class="text-sm font-medium">
        Next session
      </p>
      <p class="text-sm text-muted">
        {{ summary.training.nextSession.moduleName }} · {{ saysDay(summary.training.nextSession.heldOn) }}, {{ summary.training.nextSession.startsAt }}
        <template v-if="summary.training.nextSession.place">
          · {{ summary.training.nextSession.place }}
        </template>
      </p>
    </div>

    <div
      v-if="summary.training.nextStep"
      class="mt-4"
    >
      <p class="text-sm font-medium">
        Suggested next
      </p>
      <p class="text-sm text-muted">
        {{ summary.training.nextStep.name }}
      </p>
    </div>
  </MyTile>
</template>
