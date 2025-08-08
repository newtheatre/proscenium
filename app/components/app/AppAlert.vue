<template>
  <div
    class="alert"
    :class="`alert--${type}`"
  >
    <slot />
  </div>
</template>

<script lang="ts" setup>
defineProps({
  type: {
    type: String,
    default: 'info',
    validator: (value: string) => ['info', 'warning', 'error', 'success'].includes(value),
  },
})
</script>

<style scoped>
.alert {
  padding: 1rem;
  margin-bottom: 1rem;
  border: 2px solid transparent;
  border-radius: 0.5rem;
  width: 100%;
}

.alert--info {
  background-color: rgba(23, 162, 184, 0.1);
  color: var(--info);
  border-color: var(--info);
}

.alert--warning {
  background-color: rgba(255, 204, 0, 0.1);
  color: var(--warning);
  border-color: var(--warning);
}

.alert--error {
  background-color: rgba(255, 77, 77, 0.1);
  color: var(--error);
  border-color: var(--error);
}

.alert--success {
  background-color: rgba(40, 167, 69, 0.1);
  color: var(--success);
  border-color: var(--success);
}
</style>
