<template>
  <FormField
    :id="`${name}-group`"
    :label="label"
    :error="computedError"
    :touched="computedTouched"
  >
    <template #default="{ error: fieldError, touched: fieldTouched }">
      <div
        role="radiogroup"
        :aria-labelledby="`${name}-group`"
      >
        <div
          v-for="option in options"
          :key="getOptionValue(option)"
          class="form-group"
        >
          <input
            :id="`${name}-${getOptionValue(option)}`"
            type="radio"
            :name="name"
            :value="getOptionValue(option)"
            :checked="computedValue === getOptionValue(option)"
            :disabled="disabled"
            :required="required"
            :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
            :aria-describedby="fieldError && fieldTouched ? `${name}-error` : undefined"
            @change="onChange"
            @blur="onBlur"
            @focus="onFocus"
          >
          <label :for="`${name}-${getOptionValue(option)}`">
            {{ getOptionLabel(option) }}
          </label>
        </div>
      </div>
    </template>
  </FormField>
</template>

<script setup lang="ts">
import type { ReactiveFormField } from './types'

type Option = string | { label: string, value: string | number }

interface Props {
  name: string
  modelValue?: string | number | ReactiveFormField<string | number>
  label?: string
  options: Option[]
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
  const target = event.target as HTMLInputElement
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
div[role="radiogroup"] {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
</style>
