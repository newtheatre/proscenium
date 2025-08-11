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
