// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { createError } from 'h3'

// Where a reader goes when the thing they opened has gone. A route with somewhere better to send
// them passes its own step instead (K-128 criterion 2).
const BACK_TO_THE_LIST = 'Go back to the list and open it again'

// One place for what every missing thing says: what happened, then what to do. Two sentences, so
// both carry a stop, and the step is passed without one (docs/copy-style.md section 5).
export function saysNoSuch(noun: string, next: string = BACK_TO_THE_LIST): string {
  return `That ${noun} is no longer here. ${next}.`
}

// The 404 itself, for the great majority of routes. A route refusing with another status builds
// its own `createError` around `saysNoSuch`.
export function noSuch(noun: string, next?: string): ReturnType<typeof createError> {
  return createError({ statusCode: 404, statusMessage: saysNoSuch(noun, next) })
}
