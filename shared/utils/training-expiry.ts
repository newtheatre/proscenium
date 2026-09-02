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
