<template>
  <FormField
    :id="id"
    :label="label"
    :error="error"
    :touched="touched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <div class="form-input">
        <select
          :id="fieldId"
          :value="modelValue"
          :disabled="disabled"
          :required="required"
          :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
          :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
          :class="[
            'form-control form-select',
            { 'form-control--error': fieldError && fieldTouched },
          ]"
          @change="onChange"
          @blur="onBlur"
          @focus="onFocus"
        >
          <option
            v-if="placeholder"
            :value="placeholderValue || ''"
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
      </div>
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
  placeholderValue?: string | number
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
.form-input {
  width: 100%;
  margin-bottom: var(--spacing-sm);
}

.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=US-ASCII,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'><path fill='%23f8f9fa' d='M2 0L0 2h4z'/><path fill='%23f8f9fa' d='M2 5L0 3h4z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
  background-size: 0.65rem auto;
  padding-right: 2.5rem;
}

.form-select option {
  background-color: var(--primary-bg-color);
  color: var(--primary-text-color);
  padding: var(--spacing-sm);
}

.form-select option:checked {
  background-color: var(--nnt-orange);
  color: var(--alt-text-color);
}
</style>
