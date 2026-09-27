import { sql } from 'drizzle-orm'
import { isWorkspaceEmail } from './auth'
import type { SQL } from 'drizzle-orm'
import { localPath } from './local-path'

// What a Google sign-in resolves to, before anything is written. Kept pure so the order in
// A-104 is provable without a database or a network.

export interface CandidateAccount {
  id: string
  googleSub: string | null
  disabled: boolean
  anonymisedAt: number | null
}

export interface GoogleIdentity {
  email: string
  emailVerified: boolean
  hostedDomain: string | null
  sub: string
}

export interface GoogleLookups {
  bySub: CandidateAccount | null
  byPendingEmail: CandidateAccount | null
  byEmail: CandidateAccount | null
}

export type GoogleRefusal = 'not-workspace' | 'unverified-email' | 'disabled' | 'linked-elsewhere'

export type GoogleResolution
  = | { action: 'sign-in', userId: string }
    | { action: 'claim-pending', userId: string }
    | { action: 'claim-by-email', userId: string }
    | { action: 'create' }
    | { action: 'refuse', reason: GoogleRefusal }

function unusable(account: CandidateAccount): boolean {
  return account.disabled || account.anonymisedAt !== null
}

// Nothing is written for an account that already carries a different Google identity: moving
// one silently is a merge, and a merge is a decision a human makes (A-123).
function linkedElsewhere(account: CandidateAccount, sub: string): boolean {
  return account.googleSub !== null && account.googleSub !== sub
}

export function resolveGoogleSignIn(identity: GoogleIdentity, lookups: GoogleLookups): GoogleResolution {
  // The hosted domain is checked server-side; the OAuth hint that asked for it is cosmetic and
  // a caller can drop it (0008, A-104).
  if (identity.hostedDomain !== null && !isWorkspaceEmail(`x@${identity.hostedDomain}`)) {
    return { action: 'refuse', reason: 'not-workspace' }
  }
  if (!isWorkspaceEmail(identity.email)) return { action: 'refuse', reason: 'not-workspace' }
  if (!identity.emailVerified) return { action: 'refuse', reason: 'unverified-email' }

  if (lookups.bySub) {
    return unusable(lookups.bySub)
      ? { action: 'refuse', reason: 'disabled' }
      : { action: 'sign-in', userId: lookups.bySub.id }
  }

  for (const [candidate, action] of [
    [lookups.byPendingEmail, 'claim-pending'],
    [lookups.byEmail, 'claim-by-email'],
  ] as const) {
    if (!candidate) continue
    if (unusable(candidate)) return { action: 'refuse', reason: 'disabled' }
    if (linkedElsewhere(candidate, identity.sub)) return { action: 'refuse', reason: 'linked-elsewhere' }
    return { action, userId: candidate.id }
  }

  return { action: 'create' }
}

export interface GoogleRoundTripStart { next: string | null, reauth: boolean }

// What the first leg of the round trip asked for. Google's callback carries `code` or `error` and
// nothing of the person's own, so it is null there: it reads what the first leg kept (A-128).
export function googleRoundTripStart(query: Record<string, unknown>): GoogleRoundTripStart | null {
  if (query.code !== undefined || query.error !== undefined) return null
  return { next: localPath(query.next), reauth: query.reauth === '1' }
}

// A claim that lost its race to a second callback: the account now holds this same Google identity,
// so the person signs in with no second claim logged; any other answer is linked elsewhere (A-104).
export function afterLostGoogleClaim(currentSub: string | null, sub: string): 'SIGN_IN' | 'REFUSE' {
  return currentSub === sub ? 'SIGN_IN' : 'REFUSE'
}

// Claiming an account for a Google identity. The account's own state rides the write, so an
// erasure or a disable landing after the read leaves nothing to claim (A-104, 0003, 0011).
export function googleClaimStatement(userId: string, sub: string, now: number): SQL {
  return sql`
    UPDATE users SET google_sub = ${sub}, verified = 1, pending_google_email = NULL, google_linked_at = ${now}
    WHERE id = ${userId} AND google_sub IS NULL AND anonymised_at IS NULL AND disabled = 0
    RETURNING id
  `
}
