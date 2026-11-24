// What a planning dialogue's Save does: send, say so, close; or show the refusal on the form's fields.
// The dialogue's UForm must carry ref="formEl".
export function usePlanDialog(open: Ref<boolean>, saved: () => void) {
  const { toRefusal, fieldErrors } = useRefusal()
  const toast = useToast()
  const formEl = useFormRef('formEl')
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

  async function submit(send: () => Promise<unknown>, done: string): Promise<void> {
    refusal.value = null
    try {
      await send()
      toast.add({ title: done, color: 'success' })
      saved()
      open.value = false
    }
    catch (e) {
      refusal.value = toRefusal(e)
      formEl.value?.setErrors(fieldErrors(refusal.value))
    }
  }

  return { formEl, refusal, toRefusal, submit }
}
