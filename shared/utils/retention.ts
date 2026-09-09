// The idempotency keys the notification ledger holds for K-111. Pure, so a test can assert the
// exact string a claim takes rather than inferring it from what did or did not send.

export type RetentionWarningKind = 'window' | 'final'

// The last sign-in rides the key (0048): a fresh one changes lastLoginAt, so the old claim
// stops matching and the next dormant spell warns again rather than finding one already spent.
export function retentionWarningClaimFor(kind: RetentionWarningKind, userId: string, lastLoginAt: number): string {
  return `retention.warning.${kind}:${userId}:${lastLoginAt}`
}

// One digest per admin per period, so a re-run on the day does not send the report twice, and
// a second admin's claim is never blocked by the first's.
export function retentionDigestClaimFor(userId: string, period: string): string {
  return `retention.digest:${userId}:${period}`
}

// Whether an account is a guest for retention purposes: no password and no linked Google
// identity, so it never became a full sign-in even if it once used a magic link (0011).
export interface RetentionIdentity {
  password: string | null
  googleSub: string | null
}

export function isRetentionGuest(account: RetentionIdentity): boolean {
  return account.password === null && account.googleSub === null
}

export interface RetentionAccount extends RetentionIdentity {
  verified: boolean
}

// Anonymised without warning: a guest never claimed the account, and a warning to an address
// nobody has proven is a message A-102 criterion 2 forbids (A-126 criterion 1, amended 0026).
export function isRetentionWarnable(account: RetentionAccount): boolean {
  return account.verified && !isRetentionGuest(account)
}

// Positive means not yet due; zero or negative means the threshold has passed. A year is
// 365.25 days, the same figure the admin directory's own retention filter already uses.
export function daysUntilRetentionThreshold(lastActiveAt: number, years: number, now: number): number {
  const cutoff = lastActiveAt + Math.round(years * 365.25 * 86_400)
  return (cutoff - now) / 86_400
}
