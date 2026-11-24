<!-- One cell's pick button in the rota grid (FH-48): pressed while picked, and placed by row and
     column so the arrow keys can move between cells. -->
<script setup lang="ts">
import type { GridCell } from '../utils/rota-grid'

defineProps<{ cell: GridCell, row: number, column: number, picked: boolean, disabled: boolean, label: string }>()
const emit = defineEmits<{ pick: [cell: GridCell] }>()
const { t } = useT()
</script>

<template>
  <button
    type="button"
    class="group flex min-h-7 w-full items-center justify-center rounded-md border border-dashed border-transparent text-dimmed hover:border-default hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary disabled:hover:border-transparent disabled:hover:bg-transparent"
    :class="{ 'border-primary! bg-primary/10 text-primary': picked }"
    :data-r="row"
    :data-c="column"
    :aria-pressed="picked"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('pick', cell)"
  >
    <UIcon
      v-if="!disabled"
      :name="picked ? 'i-lucide-check' : 'i-lucide-plus'"
      class="size-4 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      :class="{ 'opacity-100!': picked }"
    />
    <span class="sr-only">{{ t('front-of-house.grid.pick') }}</span>
  </button>
</template>
