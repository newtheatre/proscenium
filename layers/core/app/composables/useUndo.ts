import { translate } from './useT'

// Undo beats confirm: where an act can be reversed, do it at once and offer Undo for ten seconds.
const UNDO_SECONDS = 10 // not-policy: the specification's ten seconds

export function useUndo() {
  const toast = useToast()
  return {
    offer(message: string, undo: () => Promise<unknown> | unknown) {
      toast.add({
        title: message,
        duration: UNDO_SECONDS * 1000, // not-policy: seconds to milliseconds
        actions: [{ label: translate('core.undo.button'), color: 'neutral', variant: 'outline', onClick: () => { void undo() } }],
      })
    },
  }
}
