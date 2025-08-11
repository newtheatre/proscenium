<template>
  <FormField
    :id="`${name}-group`"
    :label="label"
    :error="error"
    :touched="touched"
  >
    <template #default="{ error: fieldError, touched: fieldTouched }">
      <div
        role="radiogroup"
        :aria-labelledby="`${name}-group`"
      >
        <div
          v-for="option in options"
          :key="getOptionValue(option)"
        >
          <input
            :id="`${name}-${getOptionValue(option)}`"
            type="radio"
            :name="name"
            :value="getOptionValue(option)"
            :checked="modelValue === getOptionValue(option)"
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
type Option = string | { label: string, value: string | number }

interface Props {
  name: string
  modelValue?: string | number
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

defineProps<Props>()
const emit = defineEmits<Emits>()

const getOptionValue = (option: Option): string | number => {
  return typeof option === 'string' ? option : option.value
}

const getOptionLabel = (option: Option): string => {
  return typeof option === 'string' ? option : option.label
}

const onChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

const onBlur = () => emit('blur')
const onFocus = () => emit('focus')
</script>
