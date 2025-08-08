<template>
  <FormField
    :id="id"
    :label="label"
    :error="error"
    :touched="touched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <input
        :id="fieldId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
        :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
        :class="[
          'form-input',
          { 'form-input--error': fieldError && fieldTouched },
        ]"
        @input="onInput"
        @blur="onBlur"
        @focus="onFocus"
      >
    </template>
  </FormField>
</template>

<script setup lang="ts">
interface Props {
  id: string
  modelValue?: string
  label?: string
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'number'
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autocomplete?: string
  error?: string
  touched?: boolean
}

interface Emits {
  'update:modelValue': [value: string]
  'blur': []
  'focus': []
}

withDefaults(defineProps<Props>(), {
  type: 'text',
})

const emit = defineEmits<Emits>()

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

const onBlur = () => emit('blur')
const onFocus = () => emit('focus')
</script>

<style scoped>
.form-input {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input--error {
  border-color: #dc2626;
}

.form-input--error:focus {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}
</style>
