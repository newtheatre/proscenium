<script setup lang="ts">
// A primary show-night action: admit, sell, mark, refuse. At least 48 by 48, and it must work
// on a first tap, so nothing here may depend on hover, a long press or a second finger (K-102).
withDefaults(defineProps<{
  label: string
  icon?: string
  color?: 'primary' | 'error' | 'neutral'
  disabled?: boolean
  loading?: boolean
  to?: string
}>(), { color: 'primary' })

const emit = defineEmits<{ press: [] }>()
</script>

<template>
  <UButton
    :to="to"
    :color="color"
    :icon="icon"
    :disabled="disabled"
    :loading="loading"
    size="xl"
    block
    data-test="night-action"
    :aria-label="label"
    class="min-h-12 min-w-12 justify-center text-lg font-semibold"
    @click="emit('press')"
  >
    {{ label }}
  </UButton>
</template>
