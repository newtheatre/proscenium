// Confirm it is you, in place (ID-28; identity spec part 3, "How the dialogue confirms"). A request
// refused because the sign-in is not fresh, or not strong enough, opens the dialogue over the page;
// once the person confirms, the same request is sent again, so the save they pressed completes. The
// person never leaves the page and never signs in again.
export type ConfirmReason = 'core.access.not-fresh' | 'core.access.needs-strong-sign-in'

export const CONFIRM_REASONS: readonly string[] = ['core.access.not-fresh', 'core.access.needs-strong-sign-in']

export function useConfirmItsYou() {
  const overlay = useOverlay()
  // Two requests refused at once share one dialogue and one answer.
  const waiting = useState<Promise<boolean> | null>('core:confirm-its-you-waiting', () => null)

  function confirmItsYou(reason: ConfirmReason = 'core.access.not-fresh'): Promise<boolean> {
    if (waiting.value) return waiting.value
    const answer = (async () => {
      try {
        const { default: component } = await import('../components/ConfirmItsYouDialog.vue')
        const dialogue = overlay.create(component, { destroyOnClose: true })
        return (await dialogue.open({ reason }).result) === true
      }
      finally {
        waiting.value = null
      }
    })()
    waiting.value = answer
    return answer
  }

  return { confirmItsYou }
}
