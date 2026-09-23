<script setup lang="ts">
import { statusCell } from '#shared/utils/admin-conventions'

const props = defineProps<{ value: boolean, yes: string, no: string }>()
const cell = computed(() => statusCell(props.value, { yes: props.yes, no: props.no }))
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-sm"
    :title="cell.label"
    data-test="status-cell"
  >
    <UIcon
      :name="cell.icon"
      :class="cell.tone"
      class="size-5 shrink-0"
      aria-hidden="true"
    />
    <span class="text-muted sm:sr-only">{{ cell.label }}</span>
  </span>
</template>
