<template>
  <FormField
    :id="id"
    :label="label"
    :error="computedError"
    :touched="computedTouched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <div class="form-input">
        <select
          :id="fieldId"
          :value="computedValue"
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
import type { ReactiveFormField } from './types'

type Option = string | { label: string, value: string | number }

interface Props {
  id: string
  modelValue?: string | number | ReactiveFormField<string | number>
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

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Check if modelValue is a reactive form field
const isReactiveField = computed(() => {
  return props.modelValue
    && typeof props.modelValue === 'object'
    && 'value' in props.modelValue
    && 'onBlur' in props.modelValue
})

// Computed properties that work with both regular values and reactive fields
const computedValue = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string | number>
    return field.value.value
  }
  return props.modelValue
})

const computedError = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string | number>
    return field.error?.value
  }
  return props.error
})

const computedTouched = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string | number>
    return field.touched?.value
  }
  return props.touched
})

const getOptionValue = (option: Option): string | number => {
  return typeof option === 'string' ? option : option.value
}

const getOptionLabel = (option: Option): string => {
  return typeof option === 'string' ? option : option.label
}

const onChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const value = target.value

  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string | number>
    field.value.value = value
  }
  else {
    emit('update:modelValue', value)
  }
}

const onBlur = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string | number>
    if (field.onBlur) {
      field.onBlur()
    }
  }
  emit('blur')
}

const onFocus = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string | number>
    if (field.onFocus) {
      field.onFocus()
    }
  }
  emit('focus')
}
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
