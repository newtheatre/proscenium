<template>
  <FormField
    :id="id"
    :label="label"
    :error="error"
    :touched="touched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <textarea
        :id="fieldId"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :rows="rows"
        :cols="cols"
        :aria-invalid="fieldError && fieldTouched ? 'true' : 'false'"
        :aria-describedby="fieldError && fieldTouched ? `${fieldId}-error` : undefined"
        :class="[
          'form-control',
          { 'form-control--error': fieldError && fieldTouched },
        ]"
        @input="onInput"
        @blur="onBlur"
        @focus="onFocus"
      />
    </template>
  </FormField>
</template>

<script setup lang="ts">
interface Props {
  id: string
  modelValue?: string
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  rows?: number
  cols?: number
  error?: string
  touched?: boolean
}

interface Emits {
  'update:modelValue': [value: string]
  'blur': []
  'focus': []
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const onInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const onBlur = () => emit('blur')
const onFocus = () => emit('focus')
</script>

<style scoped>
textarea.form-control {
  resize: vertical;
  min-height: 120px;
}
</style>
