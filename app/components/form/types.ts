export interface ReactiveFormField<T = unknown> {
  value: WritableComputedRef<T>
  error?: ComputedRef<string | undefined>
  touched?: ComputedRef<boolean>
  onBlur?: () => void
  onFocus?: () => void
  setError?: (error?: string) => void
  setTouched?: (isTouched?: boolean) => void
  validate?: () => boolean
}
