// Rules that hold wherever they run: the browser, the worker, or a test.

// Long enough to matter, short enough that a passphrase is not refused. Length is the only
// rule: composition rules push people towards Password1! and a sticky note.
export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 200

// An address on this domain is Google-only and may never hold a password (0008).
export const WORKSPACE_DOMAIN = 'newtheatre.org.uk'

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isWorkspaceEmail(email: string): boolean {
  return normaliseEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`)
}

export interface PasswordProblem { reason: 'too-short' | 'too-long' | 'workspace-address' }

// Returns the reason a password cannot be set, or null. A Workspace address is refused here as
// well as by the database, so the caller gets a usable message instead of a constraint error.
export function passwordProblem(email: string, password: string): PasswordProblem | null {
  if (isWorkspaceEmail(email)) return { reason: 'workspace-address' }
  if (password.length < MIN_PASSWORD_LENGTH) return { reason: 'too-short' }
  if (password.length > MAX_PASSWORD_LENGTH) return { reason: 'too-long' }
  return null
}

// A session is only good while it matches the account it was sealed from (0007).
export function sessionIsCurrent(session: { epoch: number } | null, user: { sessionEpoch: number, disabled: boolean, anonymisedAt: number | null } | null): boolean {
  if (!session || !user) return false
  if (user.disabled || user.anonymisedAt !== null) return false
  return session.epoch === user.sessionEpoch
}
