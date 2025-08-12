<template>
  <div class="form-date">
    <label
      v-if="label"
      :for="id"
      class="form-date__label"
      :class="{ 'form-date__label--required': required }"
    >
      {{ label }}
    </label>
    <input
      :id="id"
      v-model="inputValue"
      type="date"
      class="form-date__input"
      :class="{
        'form-date__input--error': hasError,
        'form-date__input--touched': touched,
      }"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :min="min"
      :max="max"
      @blur="handleBlur"
      @focus="handleFocus"
    >
    <div
      v-if="hasError"
      class="form-date__error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="hint"
      class="form-date__hint"
    >
      {{ hint }}
    </div>
  </div>
</template>

<script lang="ts" setup>
interface Props {
  id: string
  modelValue?: string | Date | null
  label?: string
  placeholder?: string
  error?: string
  hint?: string
  touched?: boolean
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  min?: string
  max?: string
}

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'blur' | 'focus'): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  label: '',
  placeholder: '',
  error: '',
  hint: '',
  touched: false,
  required: false,
  disabled: false,
  readonly: false,
  min: '',
  max: '',
})

const emit = defineEmits<Emits>()

const hasError = computed(() => props.touched && props.error)

// Convert between different date formats
const inputValue = computed({
  get() {
    if (!props.modelValue) return ''

    // If it's already a string in YYYY-MM-DD format, return as is
    if (typeof props.modelValue === 'string') {
      // Check if it's in ISO format (contains 'T')
      if (props.modelValue.includes('T')) {
        return new Date(props.modelValue).toISOString().split('T')[0]
      }
      // If it's already in YYYY-MM-DD format, return as is
      if (/^\d{4}-\d{2}-\d{2}$/.test(props.modelValue)) {
        return props.modelValue
      }
      // Try to parse as date and format
      try {
        return new Date(props.modelValue).toISOString().split('T')[0]
      }
      catch {
        return ''
      }
    }

    // If it's a Date object
    if (props.modelValue instanceof Date) {
      return props.modelValue.toISOString().split('T')[0]
    }

    return ''
  },
  set(value: string) {
    emit('update:modelValue', value)
  },
})

const handleBlur = () => {
  emit('blur')
}

const handleFocus = () => {
  emit('focus')
}
</script>

<style scoped>
.form-date {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-date__label {
  font-weight: 500;
  color: var(--primary-text-color);
  font-size: 14px;
}

.form-date__label--required::after {
  content: ' *';
  color: var(--error-color);
}

.form-date__input {
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 16px;
  background: var(--input-background);
  color: var(--primary-text-color);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-date__input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-color-alpha);
}

.form-date__input--error {
  border-color: var(--error-color);
}

.form-date__input--error:focus {
  border-color: var(--error-color);
  box-shadow: 0 0 0 3px var(--error-color-alpha);
}

.form-date__input:disabled {
  background: var(--disabled-background);
  color: var(--disabled-text-color);
  cursor: not-allowed;
}

.form-date__input:readonly {
  background: var(--readonly-background);
  cursor: default;
}

.form-date__error {
  color: var(--error-color);
  font-size: 14px;
  margin-top: 4px;
}

.form-date__hint {
  color: var(--secondary-text-color);
  font-size: 14px;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .form-date__input {
    font-size: 16px; /* Prevents zoom on iOS */
  }
}
</style>
