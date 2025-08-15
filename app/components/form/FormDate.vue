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
          v-model="inputValue"
          type="date"
          :placeholder="placeholder"
          :disabled="disabled"
          :readonly="readonly"
          :required="required"
          :min="minFormatted"
          :max="maxFormatted"
          :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
          :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
          :class="[
            'form-control',
            { 'form-control--error': fieldError && fieldTouched },
          ]"
          @blur="onBlur"
          @focus="onFocus"
        >
      </div>
    </template>
  </FormField>
</template>

<script setup lang="ts">
import type { ReactiveFormField } from './types'
import { formatDateForInput, parseDateFromInput } from '~/utils/dates'

interface Props {
  id: string
  modelValue?: string | Date | null | ReactiveFormField<Date | null>
  label?: string
  placeholder?: string
  error?: string
  touched?: boolean
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  min?: string | Date
  max?: string | Date
}

interface Emits {
  'update:modelValue': [value: Date | null]
  'blur': []
  'focus': []
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  label: '',
  placeholder: '',
  error: '',
  touched: false,
  required: false,
  disabled: false,
  readonly: false,
  min: undefined,
  max: undefined,
})

const emit = defineEmits<Emits>()

// Check if modelValue is a reactive form field
const isReactiveField = computed(() => {
  return props.modelValue
    && typeof props.modelValue === 'object'
    && props.modelValue !== null
    && !(props.modelValue instanceof Date)
    && 'value' in props.modelValue
    && 'onBlur' in props.modelValue
})

// Get the actual date value from either direct value or reactive field
const actualDateValue = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<Date | null>
    return field.value.value
  }
  return props.modelValue as string | Date | null
})

// Computed properties that work with both regular values and reactive fields
const computedError = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<Date | null>
    return field.error?.value
  }
  return props.error
})

const computedTouched = computed(() => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<Date | null>
    return field.touched?.value
  }
  return props.touched
})

// Format min/max props for input
const minFormatted = computed(() => {
  if (!props.min) return undefined
  return formatDateForInput(props.min as Date | string)
})

const maxFormatted = computed(() => {
  if (!props.max) return undefined
  return formatDateForInput(props.max as Date | string)
})

const inputValue = computed({
  get() {
    return formatDateForInput(actualDateValue.value)
  },
  set(value: string) {
    const parsedDate = parseDateFromInput(value)

    if (isReactiveField.value) {
      const field = props.modelValue as ReactiveFormField<Date | null>
      field.value.value = parsedDate
    }
    else {
      emit('update:modelValue', parsedDate)
    }
  },
})

const onBlur = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<Date | null>
    if (field.onBlur) {
      field.onBlur()
    }
  }
  emit('blur')
}

const onFocus = () => {
  if (isReactiveField.value) {
    const field = props.modelValue as ReactiveFormField<Date | null>
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
