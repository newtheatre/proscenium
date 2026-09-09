// The idempotency keys the notification ledger holds for A-119, and the two windows the sweep
// binds. Pure, so a test can assert the exact string a claim takes rather than infer it.

// The expiry rides the key (0048): moving a grant's date changes the claim, so the new date is
// warned about rather than finding one already spent (criterion 1).
export function roleExpiryClaimFor(grantId: string, expiresAt: number): string {
  return `role.expiring:${grantId}:${expiresAt}`
}

// One digest per administrator per month, so a second run on the first sends nothing twice.
export function roleDigestClaimFor(userId: string, period: string): string {
  return `role.expiry.digest:${userId}:${period}`
}

// A grant lapsing at or before this is inside its holder's notice. Computed here and bound as a
// parameter, so the arithmetic exists once rather than again in SQL.
export function lapseNoticeCutoff(now: number, days: number): number {
  return now + days * 86_400
}

// A grant that lapsed at or before this is housekeeping (criterion 4). Enforcement is read-time,
// so the row has changed nothing since the instant it expired.
export function lapsedBefore(now: number, days: number): number {
  return now - days * 86_400
}
