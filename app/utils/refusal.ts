export function refusalData<T>(error: unknown): T | undefined {
  return (error as { data?: { data?: T } }).data?.data
}

// Every refusal these screens show is written by the route that raised it, so a screen cannot
// soften a security message; a validation failure's own field message (913) wins over the sentence.
export function refusalText(error: unknown, fallback = 'That did not work. Try again.'): string {
  const fields = refusalData<{ fields?: Record<string, string> }>(error)?.fields
  const fieldMessage = fields ? Object.values(fields)[0] : undefined
  const data = (error as { data?: { statusMessage?: string, message?: string } }).data
  return fieldMessage ?? data?.statusMessage ?? data?.message ?? fallback
}

// For a screen that reacts differently to "you cannot do this" than to a network drop: the same
// distinction `$fetch` itself throws with (E-112 criterion 3).
export function refusalStatus(error: unknown): number | undefined {
  return (error as { statusCode?: number }).statusCode
}

// A stale session on a sensitive action opens the re-authentication modal rather than sending the
// person away to sign in again (A-128 criterion 3).
export function needsReauthentication(error: unknown): boolean {
  return refusalData<{ reauthenticate?: boolean }>(error)?.reauthenticate === true
}

// Where to send a role that holds the permission but lacks the second factor it needs (A-112),
// so that refusal reads as an enrolment step rather than a permission the officer never had (issue 897).
export function enrolPath(error: unknown): string | null {
  return refusalData<{ enrol?: string }>(error)?.enrol ?? null
}

// K-103 protects reads; a write is unprotected by design, so a transport failure (no response at
// all, not even a refusal) needs its own words: whether it landed is unknown, not merely refused.
export function writeFailureText(error: unknown, whatToCheck: string): string {
  return refusalStatus(error) === undefined
    ? `The connection dropped, so it may or may not have gone through. ${whatToCheck}`
    : refusalText(error)
}

export type SettledRead<T, F = string>
  = { kind: 'READ', value: T, at: number }
    | { kind: 'FAILED', failure: F, status: number | undefined, at: number }

// A show-night read that never throws: a 403 is a refusal, drawn in place of the screen's work, and
// anything else a failure that keeps the screen (issue 1304). `at` is epoch milliseconds either way.
export function settleRead<T>(ask: () => Promise<T>, fallback?: string): Promise<SettledRead<T>> {
  return settleReadWith(ask, error => refusalText(error, fallback))
}

// The same, with the failure described by the caller, such as a console list's failure with its
// enrol path (issue 897).
export async function settleReadWith<T, F>(ask: () => Promise<T>, failureOf: (error: unknown) => F): Promise<SettledRead<T, F>> {
  try {
    return { kind: 'READ', value: await ask(), at: Date.now() }
  }
  catch (error) {
    return { kind: 'FAILED', failure: failureOf(error), status: refusalStatus(error), at: Date.now() }
  }
}

// What a screen draws in place of its work after a read: the refusal's own words, or nothing.
export function refusalOf(read: SettledRead<unknown>): string | null {
  return read.kind === 'FAILED' && read.status === 403 ? read.failure : null
}
