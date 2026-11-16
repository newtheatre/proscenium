// The confirmation dialog, for acts that cannot be undone. It names the thing and the consequence
// and its button repeats the verb: "Cancel the 19:30 performance of Hamlet?" ... "Cancel performance".
// There are no browser prompts anywhere in the codebase (the lint rule forbids them).
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

interface Pending extends ConfirmRequest { resolve: (answer: boolean) => void }

export function useConfirm() {
  const pending = useState<Pending | null>('core:confirm', () => null)
  function confirm(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
      pending.value?.resolve(false)
      pending.value = { ...request, resolve }
    })
  }
  function answer(value: boolean) {
    const current = pending.value
    pending.value = null
    current?.resolve(value)
  }
  return { confirm, pending, answer }
}
