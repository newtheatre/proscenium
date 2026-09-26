<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'

// The one number read across a bar (F-104 criterion 6): display size, the mono face, tabular
// figures, and words short enough that nothing competes with it.
defineProps<{ label: string, pence: number }>()
</script>

<template>
  <div
    class="rounded-xl bg-elevated px-4 py-5 text-center"
    data-test="charge-amount"
  >
    <p class="text-sm text-muted">
      {{ label }}
    </p>
    <p
      class="mt-1 font-mono text-5xl font-bold tabular-nums"
      data-test="charge-amount-figure"
    >
      {{ saysMoney(pence) }}
    </p>
    <slot />
  </div>
</template>
