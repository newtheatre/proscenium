// Where a reader goes when the thing they opened has gone. A route or a page with somewhere
// better to send them passes its own step instead (K-128 criterion 2).
const BACK_TO_THE_LIST = 'Go back to the list and open it again'

// What happened, then what to do, in two stopped sentences (docs/copy-style.md section 5).
// Shared, not server-only: a page refuses a bad address the same way a route does.
export function saysNoSuch(noun: string, next: string = BACK_TO_THE_LIST): string {
  return `That ${noun} is no longer here. ${next}.`
}

// A public page that hides an unpublished record says so without claiming it ever existed (D-101).
export function saysNotFoundYet(noun: string, next: string): string {
  return `We cannot find that ${noun}. It may not be on sale yet. ${next}.`
}

// Whether a message is one of these sentences, so the error page shows it in place of its generic
// words; the router's own "Page not found: /x" is not one (0121).
export function isNoSuchMessage(message: unknown): message is string {
  return typeof message === 'string'
    && (/^That [^.]+ is no longer here\. .+\.$/.test(message) || /^We cannot find that [^.]+\. .+\.$/.test(message))
}
