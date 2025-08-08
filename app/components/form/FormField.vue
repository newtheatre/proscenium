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
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.form-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}
</style>
