import { z } from 'zod'
import type { ZodSchema } from 'zod'
import type { ReactiveFormField } from '~/components/form/types'

interface UseFormOptions<T extends Record<string, unknown>> {
  schema?: ZodSchema<T>
  initialValues?: Partial<T>
  onSubmit?: (values: T, changedValues?: Partial<T>) => void | Promise<void>
}

// Helper function to deeply clone objects
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T
  }

  const cloned = {} as T
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key])
    }
  }
  return cloned
}

// Helper function to get value at nested path
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
  }, obj as unknown)
}

// Helper function to set value at nested path
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    return current[key] as Record<string, unknown>
  }, obj)
  target[lastKey] = value
}

// Helper function to check if two values are deeply equal
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return false
  }

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)

  if (keysA.length !== keysB.length) return false

  return keysA.every(key => deepEqual(
    (a as Record<string, unknown>)[key],
    (b as Record<string, unknown>)[key],
  ))
}

// Helper function to get changed values
function getChangedValuesHelper<T extends Record<string, unknown>>(
  current: T,
  original: T,
  excludeFields: string[] = [],
): Partial<T> {
  const changes: Partial<T> = {}

  function compareObjects(currentObj: Record<string, unknown>, originalObj: Record<string, unknown>, prefix = '') {
    for (const key in currentObj) {
      const fullPath = prefix ? `${prefix}.${key}` : key

      if (excludeFields.includes(fullPath)) {
        continue
      }

      const currentValue = currentObj[key]
      const originalValue = originalObj[key]

      if (!deepEqual(currentValue, originalValue)) {
        if (prefix) {
          // For nested objects, set the entire parent object
          const parentKey = prefix.split('.')[0]
          if (parentKey && !changes[parentKey as keyof T]) {
            const nestedValue = getNestedValue(current, parentKey)
            changes[parentKey as keyof T] = deepClone(nestedValue) as T[keyof T]
          }
        }
        else {
          changes[key as keyof T] = currentValue as T[keyof T]
        }
      }
    }
  }

  compareObjects(current, original)
  return changes
}

export function useForm<T extends Record<string, unknown>>(options: UseFormOptions<T> = {}) {
  const { schema, initialValues = {}, onSubmit } = options

  const formData = reactive<Record<string, unknown>>({})
  const errors = reactive<Record<string, string | undefined>>({})
  const touched = reactive<Record<string, boolean>>({})
  const isSubmitting = ref(false)
  const submitCount = ref(0)
  const formError = ref<string | undefined>(undefined)
  const _originalValues = ref<T | null>(null)

  // Initialize form data with deep cloning for nested objects
  const initializeForm = (values: Partial<T>) => {
    const clonedValues = deepClone(values)
    Object.entries(clonedValues).forEach(([key, value]) => {
      formData[key] = value
      errors[key] = undefined
      touched[key] = false
    })

    // Store original values for change detection
    _originalValues.value = deepClone(clonedValues) as T
  }

  // Initialize with initial values
  initializeForm(initialValues)

  // Get current form values
  const getValues = (): T => {
    return { ...formData } as T
  }

  // Update form with new values (useful for loading data from API)
  const setValues = (values: Partial<T>, markAsOriginal = true) => {
    Object.entries(values).forEach(([key, value]) => {
      formData[key] = value
    })

    if (markAsOriginal) {
      _originalValues.value = deepClone(values) as T
    }
  }

  // Get changed values compared to original
  const getChangedValues = (excludeFields: string[] = ['password']): Partial<T> => {
    if (!_originalValues.value) {
      return getValues()
    }

    return getChangedValuesHelper(getValues(), _originalValues.value, excludeFields)
  }

  // Set field value with support for nested paths
  const setValue = (name: string, value: unknown) => {
    if (name.includes('.')) {
      setNestedValue(formData, name, value)
    }
    else {
      formData[name] = value
    }

    // Validate field if it has been touched
    if (touched[name]) {
      validateField(name)
    }
  }

  // Get field value with support for nested paths
  const getValue = (name: string): unknown => {
    if (name.includes('.')) {
      return getNestedValue(formData, name)
    }
    return formData[name]
  }

  // Set field error
  const setError = (name: string, error?: string) => {
    errors[name] = error
  }

  // Set multiple errors (useful for API validation responses)
  const setErrors = (errorMap: Record<string, string>) => {
    Object.entries(errorMap).forEach(([name, error]) => {
      errors[name] = error
      touched[name] = true
    })
  }

  // Set field touched
  const setTouched = (name: string, isTouched = true) => {
    touched[name] = isTouched
    // Validate field when it becomes touched
    if (isTouched) {
      validateField(name)
    }
  }

  // Set form error (for general form submission errors)
  const setFormError = (error?: string) => {
    formError.value = error
  }

  // Clear form error
  const clearFormError = () => {
    formError.value = undefined
  }

  // Clear all errors
  const clearErrors = () => {
    Object.keys(errors).forEach((key) => {
      errors[key] = undefined
    })
    clearFormError()
  }

  // Validate a single field
  const validateField = (name: string): boolean => {
    if (!schema) return true

    try {
      const values = getValues()
      schema.parse(values)
      setError(name, undefined)
      return true
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        const fieldError = error.errors.find(e => e.path.join('.') === name)
        setError(name, fieldError?.message)
        return !fieldError
      }
      return false
    }
  }

  // Validate all fields
  const validate = (): boolean => {
    if (!schema) return true

    try {
      const values = getValues()
      schema.parse(values)

      // Clear all errors
      clearErrors()
      return true
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        // Clear all errors first
        clearErrors()

        // Set specific errors
        error.errors.forEach((err) => {
          const fieldName = err.path.join('.')
          if (fieldName) {
            setError(fieldName, err.message)
            setTouched(fieldName, true)
          }
        })
      }
      return false
    }
  }

  // Handle form submission
  const handleSubmit = async (event?: Event) => {
    if (event) {
      event.preventDefault()
    }

    submitCount.value++

    // Clear any previous form errors
    clearFormError()

    // Mark all fields as touched
    Object.keys(formData).forEach((name) => {
      setTouched(name, true)
    })

    if (!validate()) {
      return
    }

    if (onSubmit) {
      isSubmitting.value = true
      try {
        const currentValues = getValues()
        const changedValues = _originalValues.value ? getChangedValues(['password']) : currentValues
        await onSubmit(currentValues, changedValues)
      }
      finally {
        isSubmitting.value = false
      }
    }
  }

  // Reset form
  const reset = () => {
    initializeForm(initialValues)
    submitCount.value = 0
    clearFormError()
  }

  // Check if form is valid
  const isValid = computed(() => {
    return Object.values(errors).every(error => !error)
  })

  // Check if form has been touched
  const isTouched = computed(() => {
    return Object.values(touched).some(t => t)
  })

  // Check if form is dirty (has changes)
  const isDirty = computed(() => {
    if (!_originalValues.value) return false
    return !deepEqual(getValues(), _originalValues.value)
  })

  // Create a field helper that returns a simple reactive ref with nested path support
  const field = <V = string>(name: keyof T | string, defaultValue?: V): WritableComputedRef<V> => {
    const fieldName = String(name)

    // Initialize field if it doesn't exist
    if (fieldName.includes('.')) {
      if (getNestedValue(formData, fieldName) === undefined) {
        const initialValue = defaultValue ?? getNestedValue(initialValues as Record<string, unknown>, fieldName) ?? ('' as V)
        setNestedValue(formData, fieldName, initialValue)
        errors[fieldName] = undefined
        touched[fieldName] = false
      }
    }
    else if (!(fieldName in formData)) {
      const initialValue = defaultValue ?? (initialValues as Record<string, unknown>)[fieldName] ?? ('' as V)
      formData[fieldName] = initialValue
      errors[fieldName] = undefined
      touched[fieldName] = false
    }

    return computed({
      get: () => {
        if (fieldName.includes('.')) {
          return getNestedValue(formData, fieldName) as V
        }
        return formData[fieldName] as V
      },
      set: (value: V) => setValue(fieldName, value),
    })
  }

  // Create a reactive form field with all handlers (recommended approach)
  // Supports both top-level keys and nested paths like 'profile.name'
  const reactiveField = <V = string>(name: keyof T | string, defaultValue?: V): ReactiveFormField<V> => {
    const fieldName = String(name)

    // Use the enhanced field method to get the reactive value
    const fieldRef = field(name, defaultValue)

    return {
      // The reactive value for v-model
      value: fieldRef,

      // Event handlers
      onBlur: () => setTouched(fieldName, true),
      onFocus: () => {
        // Could be used for analytics or other focus-based logic
      },

      // Field state
      error: computed(() => errors[fieldName]),
      touched: computed(() => Boolean(touched[fieldName])),

      // Field methods
      setError: (error?: string) => setError(fieldName, error),
      setTouched: (isTouched = true) => setTouched(fieldName, isTouched),
      validate: () => validateField(fieldName),
    }
  }

  // Register field - returns reactive field object (for backward compatibility)
  const register = (name: string, defaultValue?: unknown) => {
    const initialValue = defaultValue ?? getNestedValue(initialValues as Record<string, unknown>, name) ?? ''

    // Initialize field if not exists
    if (name.includes('.')) {
      if (getNestedValue(formData, name) === undefined) {
        setNestedValue(formData, name, initialValue)
        errors[name] = undefined
        touched[name] = false
      }
    }
    else if (!(name in formData)) {
      formData[name] = initialValue
      errors[name] = undefined
      touched[name] = false
    }

    return {
      value: computed({
        get: () => {
          if (name.includes('.')) {
            const value = getNestedValue(formData, name)
            return value ?? (typeof initialValue === 'string' ? '' : initialValue)
          }
          return formData[name] ?? (typeof initialValue === 'string' ? '' : initialValue)
        },
        set: (value: unknown) => setValue(name, value),
      }),
      error: computed(() => errors[name] || undefined),
      touched: computed(() => Boolean(touched[name])),
      setValue: (value: unknown) => setValue(name, value),
      setError: (error?: string) => setError(name, error),
      setTouched: (isTouched = true) => setTouched(name, isTouched),
      validate: () => validateField(name),
    }
  }

  return {
    // State
    isSubmitting: readonly(isSubmitting),
    isValid,
    isTouched,
    isDirty,
    submitCount: readonly(submitCount),
    formError: readonly(formError),

    // Form data
    formData: readonly(formData),
    errors: readonly(errors),
    touched: readonly(touched),

    // Methods
    getValues,
    setValues,
    getChangedValues,
    setValue,
    getValue,
    setError,
    setErrors,
    setTouched,
    setFormError,
    clearFormError,
    clearErrors,
    validate,
    validateField,
    handleSubmit,
    reset,
    register,
    field,
    reactiveField,
  }
}
