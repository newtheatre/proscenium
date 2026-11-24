// A dialogue's one act: busy while it runs, its refusal shown in the dialogue, and true once it is done.
export function useDialogAct() {
  const { toRefusal } = useRefusal()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const busy = ref(false)
  async function attempt(what: () => Promise<unknown>): Promise<boolean> {
    refusal.value = null
    busy.value = true
    try {
      await what()
      return true
    }
    catch (e) {
      refusal.value = toRefusal(e)
      return false
    }
    finally {
      busy.value = false
    }
  }
  return { refusal, busy, attempt }
}
