<!-- A status always carries a word, and pairs its colour with a shape, so it never depends on
     colour alone. Status colours are fixed: success, warning and danger never follow the brand. -->
<script setup lang="ts">
const props = defineProps<{
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  label: string
}>()

const look = computed(() => ({
  success: { color: 'success', icon: 'i-lucide-circle-check' },
  warning: { color: 'warning', icon: 'i-lucide-triangle-alert' },
  danger: { color: 'error', icon: 'i-lucide-octagon-alert' },
  info: { color: 'info', icon: 'i-lucide-info' },
  neutral: { color: 'neutral', icon: 'i-lucide-circle-dashed' },
} as const)[props.tone])
</script>

<template>
  <UBadge
    :color="look.color"
    variant="subtle"
    :icon="look.icon"
    :label="label"
  />
</template>
