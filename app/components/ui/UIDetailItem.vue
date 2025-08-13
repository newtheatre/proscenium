<template>
  <div :class="['detail-item', { 'detail-item--full': fullWidth }]">
    <label class="detail-label">{{ label }}</label>
    <div class="detail-value">
      <slot>
        {{ value || 'Not set' }}
      </slot>
    </div>
  </div>
</template>

<script lang="ts" setup>
interface Props {
  label: string
  value?: string | number | null
  fullWidth?: boolean
}

defineProps<Props>()
</script>

<style scoped>
.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.detail-item--full {
  grid-column: 1 / -1;
}

.detail-label {
  font-weight: 600;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  color: var(--primary-text-color);
  font-size: var(--font-size-base);
}

.text-muted {
  color: var(--text-muted);
  font-style: italic;
}
</style>
