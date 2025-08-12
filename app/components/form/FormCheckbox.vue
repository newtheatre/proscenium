<template>
  <FormField
    :id="id"
    :error="error"
    :touched="touched"
  >
    <template #default="{ id: fieldId, error: fieldError, touched: fieldTouched }">
      <div class="form-group">
        <input
          :id="fieldId"
          type="checkbox"
          :checked="modelValue"
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
interface Props {
  id: string
  modelValue?: boolean
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

defineProps<Props>()
const emit = defineEmits<Emits>()

const onChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.checked)
}

const onBlur = () => emit('blur')
const onFocus = () => emit('focus')
</script>
