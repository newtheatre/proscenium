<!-- The bar's panel in the combined till in live mode (/live/till): the same basket as the desk's,
     with big product tiles a category at a time, for a phone or tablet behind the bar. -->
<script setup lang="ts">
defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null, settled?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()
</script>

<template>
  <BarTillPanel
    :model-value="modelValue"
    :locked="locked"
    :summary="summary"
    large
    @update:model-value="v => emit('update:modelValue', v)"
  />
</template>
