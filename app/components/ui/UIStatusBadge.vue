<template>
  <span
    :class="[
      'status-badge',
      `status-badge--${variant}`,
    ]"
  >
    {{ label }}
  </span>
</template>

<script lang="ts" setup>
interface Props {
  variant: 'success' | 'warning' | 'error' | 'info'
  label: string
}

defineProps<Props>()
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
