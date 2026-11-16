// The confirmation dialog, for acts that cannot be undone. It names the thing and the consequence
// and its button repeats the verb: "Cancel the 19:30 performance of Hamlet?" ... "Cancel performance".
// There are no browser prompts anywhere in the codebase (the lint rule forbids them). The dialog is
// opened through Nuxt UI's overlays, so nothing is mounted until it is first asked for.
export interface ConfirmRequest {
  /** The verb: "Cancel", "Delete", "Refund". */
  verb: string
  /** The thing, with its article: "the 19:30 performance of Hamlet". */
  thing: string
  /** What happens next: "84 ticket holders will be emailed." */
  consequence: string
  /** The button's own words, when more than the verb helps: "Cancel performance". */
  button?: string
}

export function useConfirm() {
  const overlay = useOverlay()
  /** Resolves true only when the person presses the button that repeats the verb. */
  async function confirm(request: ConfirmRequest): Promise<boolean> {
    const { default: component } = await import('../components/ConfirmDialog.vue')
    const dialog = overlay.create(component, { destroyOnClose: true })
    return (await dialog.open(request).result) === true
  }
  return { confirm }
}
