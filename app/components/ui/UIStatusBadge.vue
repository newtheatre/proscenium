<template>
  <span
    :class="[
      'status-badge',
      `status-badge--${safeVariant}`,
    ]"
  >
    {{ safeLabel }}
  </span>
</template>

<script lang="ts" setup>
interface Props {
  variant?: 'success' | 'warning' | 'error' | 'info' | string
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'info',
  label: 'Unknown',
})

// Computed properties to ensure safe values
const safeVariant = computed(() => {
  const validVariants = ['success', 'warning', 'error', 'info']
  return validVariants.includes(props.variant) ? props.variant : 'info'
})

const safeLabel = computed(() => {
  return props.label || 'Unknown'
})
</script>

<style scoped>
.status-badge {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-block;
  transition: var(--transition-fast);
}

.status-badge--success {
  background-color: var(--success);
  color: var(--primary-bg-color);
}

.status-badge--warning {
  background-color: var(--warning);
  color: var(--primary-bg-color);
}

.status-badge--error {
  background-color: var(--error);
  color: var(--primary-text-color);
}

.status-badge--info {
  background-color: var(--info);
  color: var(--primary-text-color);
}
</style>
