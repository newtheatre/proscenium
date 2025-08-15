<template>
  <FormField
    :id="id"
    :label="label"
    :error="computedError"
    :touched="computedTouched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <div class="form-input">
        <input
          :id="fieldId"
          :type="type"
          :value="computedValue"
          :placeholder="placeholder"
          :disabled="disabled"
          :required="required"
          :autocomplete="autocomplete"
          :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
          :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
          :class="[
            'form-control',
            { 'form-control--error': fieldError && fieldTouched },
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
import type { ReactiveFormField } from './types'

interface Props {
  id: string
  modelValue?: string | ReactiveFormField<string> // Can be string or reactive field
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

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
})

const emit = defineEmits<Emits>()

// Check if modelValue is a reactive form field
const isReactiveField = computed(() => {
  return props.modelValue
    && typeof props.modelValue === 'object'
    && 'value' in props.modelValue
    && 'onBlur' in props.modelValue
})

// Computed properties that work with both string values and reactive fields
const computedValue = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string>
    return field.value.value
  }
  return props.modelValue as string || ''
})

const computedError = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string>
    return field.error?.value
  }
  return props.error
})

const computedTouched = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string>
    return field.touched?.value
  }
  return props.touched
})

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value

  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string>
    field.value.value = value
  }
  else {
    emit('update:modelValue', value)
  }
}

const onBlur = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string>
    if (field.onBlur) {
      field.onBlur()
    }
  }
  emit('blur')
}

const onFocus = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<string>
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
</style>
