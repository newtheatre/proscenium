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
  /** 'danger' (the default) draws the button red, for an act that takes something away; 'primary' for one that does not. */
  tone?: 'danger' | 'primary'
  /** A tick box under the consequence for something to do as well, such as emptying the basket, and whether it starts ticked. */
  tick?: { label: string, ticked: boolean }
}

export function useConfirm() {
  const overlay = useOverlay()
  /** Resolves true only when the person presses the button that repeats the verb. */
  async function confirm(request: ConfirmRequest): Promise<boolean> {
    const { default: component } = await import('../components/ConfirmDialog.vue')
    const dialog = overlay.create(component, { destroyOnClose: true })
    const answer = await dialog.open(request).result
    return answer === true || (typeof answer === 'object' && answer !== null)
  }
  /** As confirm, with the request's tick box: false when not confirmed, otherwise whether the box was left ticked. */
  async function confirmTicked(request: ConfirmRequest & { tick: NonNullable<ConfirmRequest['tick']> }): Promise<false | { ticked: boolean }> {
    const { default: component } = await import('../components/ConfirmDialog.vue')
    const dialog = overlay.create(component, { destroyOnClose: true })
    const answer: unknown = await dialog.open(request).result
    return typeof answer === 'object' && answer !== null && 'ticked' in answer ? { ticked: (answer as { ticked: boolean }).ticked } : false
  }
  return { confirm, confirmTicked }
}
