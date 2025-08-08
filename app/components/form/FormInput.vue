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
  border: 1px solid #ccc;
  border-radius: 0.25rem;
  font-size: 1rem;
}

.form-input__field:focus {
  outline: none;
  border-color: var(--nnt-purple, #6b46c1);
}

.form-input__field--error {
  border-color: var(--error, #e53e3e);
}

.form-input__field:disabled {
  background-color: #f2f2f2;
  cursor: not-allowed;
}
</style>
