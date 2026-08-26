import { isWorkspaceEmail } from './auth'

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
