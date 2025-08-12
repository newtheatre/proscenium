<template>
  <div class="form-field">
    <label
      v-if="label"
      :for="id"
      class="form-label"
    >{{ label }}</label>
    <slot
      :id="id"
      :error="error"
      :touched="touched"
    />
    <div
      v-if="error && touched"
      :id="`${id}-error`"
      role="alert"
      class="form-error"
    >
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  label?: string
  id: string
  error?: string
  touched?: boolean
}

defineProps<Props>()
</script>

<style scoped>
.form-field {
  margin-bottom: var(--spacing-md);
}

.form-label {
  display: block;
  margin-bottom: var(--spacing-sm);
  font-weight: 500;
}

.form-error {
  color: var(--error);
  font-size: 0.875rem;
  margin-top: var(--spacing-xs);
}
</style>
