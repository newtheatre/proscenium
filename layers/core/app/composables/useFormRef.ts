// A UForm's template ref, typed for what a screen uses: its field errors, and `loading` while its submit
// runs, so a Save drawn outside the form (a dialogue's footer, with `form=`) takes `:loading="ref?.loading"`.
export interface FormHandle {
  setErrors: (errors: { name?: string, message: string }[]) => void
  loading: boolean
}

export function useFormRef(name: string) {
  return useTemplateRef<FormHandle>(name)
}
