<!-- The key under the grid: each level's colour and name, so colour is never the only signal. -->
<script setup lang="ts">
import type { ShownLevel } from '../../shared/levels'

defineProps<{ commitments?: boolean }>()
const { t } = useT()
const LEGEND: ShownLevel[] = ['free', 'maybe', 'busy', 'unknown']
const SWATCH: Record<ShownLevel, string> = { free: 'bg-success/25', maybe: 'bg-warning/30', busy: 'bg-error/25', unknown: 'availability-hatch' }
</script>

<template>
  <ul
    class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted"
    :aria-label="t('availability.mine.key')"
  >
    <li
      v-for="level in LEGEND"
      :key="level"
      class="flex items-center gap-1.5"
    >
      <span
        class="inline-block size-3.5 rounded-sm border border-default"
        :class="SWATCH[level]"
      />{{ t(`availability.levels.${level}`) }}
    </li>
    <li
      v-if="commitments"
      class="flex items-center gap-1.5"
    >
      <UIcon
        name="i-lucide-lock"
        class="size-3.5"
      />{{ t('availability.mine.commitment') }}
    </li>
  </ul>
</template>

<style scoped>
.availability-hatch {
  background-image: repeating-linear-gradient(135deg, var(--ui-bg-accented) 0 4px, transparent 4px 8px);
}
</style>
