<template>
  <FormField
    :id="id"
    :error="computedError"
    :touched="computedTouched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <div class="form-group">
        <input
          :id="fieldId"
          type="checkbox"
          :checked="computedValue"
          :disabled="disabled"
          :required="required"
          :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
          :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
          @change="onChange"
          @blur="onBlur"
          @focus="onFocus"
        >
        <label :for="fieldId">{{ label }}</label>
      </div>
    </template>
  </FormField>
</template>

<script setup lang="ts">
import type { ReactiveFormField } from './types'

interface Props {
  id: string
  modelValue?: boolean | ReactiveFormField<boolean>
  label?: string
  disabled?: boolean
  required?: boolean
  error?: string
  touched?: boolean
}

interface Emits {
  'update:modelValue': [value: boolean]
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

// Computed properties that work with both boolean values and reactive fields
const computedValue = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<boolean>
    return Boolean(field.value.value)
  }
  return Boolean(props.modelValue)
})

const computedError = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<boolean>
    return field.error?.value
  }
  return props.error
})

const computedTouched = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<boolean>
    return field.touched?.value
  }
  return props.touched
})

const onChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.checked

  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<boolean>
    field.value.value = value
  }
  else {
    emit('update:modelValue', value)
  }
}

const onBlur = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<boolean>
    if (field.onBlur) {
      field.onBlur()
    }
  }
  emit('blur')
}

const onFocus = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<boolean>
    if (field.onFocus) {
      field.onFocus()
    }
  }
  emit('focus')
}
</script>
