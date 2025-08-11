<template>
  <FormField
    :id="id"
    :label="label"
    :error="error"
    :touched="touched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <div class="form-input">
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
            'form-input__field',
            { 'form-input__field--error': fieldError && fieldTouched },
          ]"
          @input="onInput"
          @blur="onBlur"
          @focus="onFocus"
        >
      </div>
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
  width: 100%;
  margin-bottom: 0.5rem;
}

.form-input__field {
  width: 100%;
  padding: 0.5rem;
  background-color: var(--primary-bg-color);
  color: var(--primary-text-color);
  border: 1px solid #404040;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-input__field::placeholder {
  color: #888;
}

.form-input__field:focus {
  outline: none;
  border-color: var(--nnt-orange);
  box-shadow: 0 0 0 3px rgba(255, 196, 37, 0.1);
}

.form-input__field--error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px rgba(255, 77, 77, 0.1);
}

.form-input__field:disabled {
  background-color: #2a2a2a;
  color: #888;
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
