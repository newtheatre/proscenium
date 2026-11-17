// Undo beats confirm: where an act can be reversed, do it at once and offer Undo for ten seconds.
// `offer` is the toast that says an act is done; its Undo runs the reverse act, then says whether
// that worked. Use it in place of a plain success toast wherever the reverse act exists.
const UNDO_SECONDS = 10 // not-policy: the specification's ten seconds

export function useUndo() {
  const toast = useToast()
  const { toRefusal } = useRefusal()
  return {
    offer(message: string, undo?: () => Promise<unknown> | unknown) {
      toast.add({
        title: message,
        color: 'success',
        ...(undo
          ? {
              duration: UNDO_SECONDS * 1000, // not-policy: seconds to milliseconds
              actions: [{
                label: translate('core.undo.button'),
                icon: 'i-lucide-undo-2',
                color: 'neutral' as const,
                variant: 'outline' as const,
                onClick: async () => {
                  try {
                    await undo()
                    toast.add({ title: translate('core.undo.done'), color: 'neutral' })
                  }
                  catch (e) {
                    toast.add({ title: translate('core.undo.failed'), description: toRefusal(e).reason, color: 'error' })
                  }
                },
              }],
            }
          : {}),
      })
    },
  }
}
