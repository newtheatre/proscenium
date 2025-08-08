import { z } from 'zod'
import type { ZodSchema } from 'zod'

interface UseFormOptions<T extends Record<string, unknown>> {
  schema?: ZodSchema<T>
  initialValues?: Partial<T>
  onSubmit?: (values: T) => void | Promise<void>
}

export function useForm<T extends Record<string, unknown>>(options: UseFormOptions<T> = {}) {
  const { schema, initialValues = {}, onSubmit } = options

  const formData = reactive<Record<string, unknown>>({})
  const errors = reactive<Record<string, string | undefined>>({})
  const touched = reactive<Record<string, boolean>>({})
  const isSubmitting = ref(false)
  const submitCount = ref(0)
  const formError = ref<string | undefined>(undefined)

  // Initialize form data
  Object.entries(initialValues).forEach(([key, value]) => {
    formData[key] = value
    errors[key] = undefined
    touched[key] = false
  })

  // Get current form values
  const getValues = (): T => {
    return { ...formData } as T
  }

  // Set field value
  const setValue = (name: string, value: unknown) => {
    formData[name] = value
    // Validate field if it has been touched
    if (touched[name]) {
      validateField(name)
    }
  }

  // Set field error
  const setError = (name: string, error?: string) => {
    errors[name] = error
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
        const fieldError = error.errors.find(e => e.path[0] === name)
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
      Object.keys(formData).forEach((name) => {
        setError(name, undefined)
      })

      return true
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        // Clear all errors first
        Object.keys(formData).forEach((name) => {
          setError(name, undefined)
        })

        // Set specific errors
        error.errors.forEach((err) => {
          const fieldName = err.path[0] as string
          if (fieldName) {
            setError(fieldName, err.message)
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
        await onSubmit(getValues())
      }
      finally {
        isSubmitting.value = false
      }
    }
  }

  // Reset form
  const reset = () => {
    Object.entries(initialValues).forEach(([name, value]) => {
      formData[name] = value || ''
      errors[name] = undefined
      touched[name] = false
    })
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
    return Object.entries(formData).some(([name, value]) => {
      const initialValue = (initialValues as Record<string, unknown>)[name]
      return value !== (initialValue || '')
    })
  })

  // Register field - returns reactive field object
  const register = (name: string, defaultValue?: unknown) => {
    const initialValue = defaultValue ?? (initialValues as Record<string, unknown>)[name] ?? ''

    // Initialize field if not exists
    if (!(name in formData)) {
      formData[name] = initialValue
      errors[name] = undefined
      touched[name] = false
    }

    return {
      value: computed({
        get: () => (formData[name] ?? '') as string,
        set: (value: string) => setValue(name, value),
      }),
      error: computed(() => errors[name]),
      touched: computed(() => touched[name] || false),
      setValue: (value: unknown) => setValue(name, value),
      setError: (error?: string) => setError(name, error),
      setTouched: (isTouched = true) => setTouched(name, isTouched),
      validate: () => validateField(name),
    }
  }

  return {
    isSubmitting: readonly(isSubmitting),
    isValid,
    isTouched,
    isDirty,
    submitCount: readonly(submitCount),
    formError: readonly(formError),
    register,
    getValues,
    setValue,
    setError,
    setTouched,
    setFormError,
    clearFormError,
    validate,
    validateField,
    handleSubmit,
    reset,
  }
}
