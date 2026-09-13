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
