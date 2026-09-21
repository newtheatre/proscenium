// Where a reader goes when the thing they opened has gone. A route or a page with somewhere
// better to send them passes its own step instead (K-128 criterion 2).
const BACK_TO_THE_LIST = 'Go back to the list and open it again'

// What happened, then what to do, in two stopped sentences (docs/copy-style.md section 5).
// Shared, not server-only: a page refuses a bad address the same way a route does.
export function saysNoSuch(noun: string, next: string = BACK_TO_THE_LIST): string {
  return `That ${noun} is no longer here. ${next}.`
}
