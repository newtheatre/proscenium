// The idempotency keys the notification ledger holds. Pure, so a test can assert the exact string
// a claim takes rather than inferring it from what did or did not send (G-125 criterion 1).

export type WarningKind = 'window' | 'final'

// One claim per record and window. The two warnings are independent: the gentle one having gone
// out never suppresses the urgent one, so a record inside both windows gets both.
export function claimFor(kind: WarningKind, recordId: string): string {
  return `training.expiry.${kind}:${recordId}`
}

// One digest per person per month, so a re-run on the first of the month sends nothing twice.
export function digestClaimFor(userId: string, period: string): string {
  return `training.expiry.digest:${userId}:${period}`
}

// G-119. A register unmarked from day 2 is nagged weekly and stops at 60 days, so the claim is
// per session and per week: week 0 is the first nag, and the arithmetic is what makes it weekly.
export function nagWeek(heldOn: string, today: string): number | null {
  const days = daysSince(heldOn, today)
  if (days < NAG_FROM_DAYS || days > NAG_UNTIL_DAYS) return null
  return Math.floor((days - NAG_FROM_DAYS) / 7)
}

export const NAG_FROM_DAYS = 2
export const NAG_UNTIL_DAYS = 60

export function nagClaimFor(sessionId: string, week: number): string {
  return `training.register.nag:${sessionId}:${week}`
}

// Whole days between two London civil dates. Not an instant subtraction: a session held on the
// 5th is two days old on the 7th whatever the clocks did in between (0014).
function daysSince(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}
