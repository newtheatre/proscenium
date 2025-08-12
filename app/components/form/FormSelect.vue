<template>
  <FormField
    :id="id"
    :label="label"
    :error="error"
    :touched="touched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <select
        :id="fieldId"
        :value="modelValue"
        :disabled="disabled"
        :required="required"
        :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
        :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
        :class="[
          'form-select__field',
          { 'form-select__field--error': fieldError && fieldTouched },
        ]"
        @change="onChange"
        @blur="onBlur"
        @focus="onFocus"
      >
        <option
          v-if="placeholder"
          value=""
        >
          {{ placeholder }}
        </option>
        <option
          v-for="option in options"
          :key="getOptionValue(option)"
          :value="getOptionValue(option)"
        >
          {{ getOptionLabel(option) }}
        </option>
      </select>
    </template>
  </FormField>
</template>

<script setup lang="ts">
type Option = string | { label: string, value: string | number }

interface Props {
  id: string
  modelValue?: string | number
  label?: string
  options: Option[]
  placeholder?: string
  disabled?: boolean
  required?: boolean
  error?: string
  touched?: boolean
}

interface Emits {
  'update:modelValue': [value: string | number]
  'blur': []
  'focus': []
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const getOptionValue = (option: Option): string | number => {
  return typeof option === 'string' ? option : option.value
}

const getOptionLabel = (option: Option): string => {
  return typeof option === 'string' ? option : option.label
}

const onChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const value = target.value
  emit('update:modelValue', value)
}

const onBlur = () => emit('blur')
const onFocus = () => emit('focus')
</script>

<style scoped>
.form-select__field {
  width: 100%;
  padding: 0.5rem;
  background-color: var(--primary-bg-color);
  color: var(--primary-text-color);
  border: 1px solid #404040;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=US-ASCII,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'><path fill='%23f8f9fa' d='M2 0L0 2h4z'/><path fill='%23f8f9fa' d='M2 5L0 3h4z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
  background-size: 0.65rem auto;
  padding-right: 2.5rem;
}

.form-select__field:focus {
  outline: none;
  border-color: var(--nnt-orange);
  box-shadow: 0 0 0 3px rgba(255, 196, 37, 0.1);
}

.form-select__field--error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px rgba(255, 77, 77, 0.1);
}

.form-select__field:disabled {
  background-color: #2a2a2a;
  color: #888;
  cursor: not-allowed;
  opacity: 0.6;
}

.form-select__field option {
  background-color: var(--primary-bg-color);
  color: var(--primary-text-color);
  padding: 0.5rem;
}

.form-select__field option:checked {
  background-color: var(--nnt-orange);
  color: var(--alt-text-color);
}
</style>
