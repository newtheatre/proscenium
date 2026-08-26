// Rules that hold wherever they run: the browser, the worker, or a test.

// A sibling, so a plain relative import: the #shared alias is for reaching in from outside.
import { CONFIG_KEYS } from './config'

export interface PasswordPolicy {
  minLength: number
  maxLength: number
  requireMixedCase: boolean
  requireNumber: boolean
  requireSymbol: boolean
}

// The shipped defaults. Once the settings surface reads the config table these come from there
// instead; the shape is the same either way (0012).
export function defaultPasswordPolicy(): PasswordPolicy {
  return {
    minLength: CONFIG_KEYS.PASSWORD_MIN_LENGTH.default,
    maxLength: CONFIG_KEYS.PASSWORD_MAX_LENGTH.default,
    requireMixedCase: CONFIG_KEYS.PASSWORD_REQUIRE_MIXED_CASE.default,
    requireNumber: CONFIG_KEYS.PASSWORD_REQUIRE_NUMBER.default,
    requireSymbol: CONFIG_KEYS.PASSWORD_REQUIRE_SYMBOL.default,
  }
}

// A transport guard, not policy: not what makes an acceptable password, but what is worth
// reading and hashing at all. A test pins it above anything the configuration will accept.
export const ABSOLUTE_PASSWORD_LIMIT = 1024

// An address on this domain is Google-only and may never hold a password (0008).
export const WORKSPACE_DOMAIN = 'newtheatre.org.uk'

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isWorkspaceEmail(email: string): boolean {
  return normaliseEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`)
}

export type PasswordProblemReason
  = | 'workspace-address'
    | 'too-short'
    | 'too-long'
    | 'needs-mixed-case'
    | 'needs-number'
    | 'needs-symbol'

export interface PasswordProblem { reason: PasswordProblemReason, policy: PasswordPolicy }

// Returns the reason a password cannot be set, or null. A Workspace address is refused here as
// well as by the database, so the caller gets a usable message instead of a constraint error.
export function passwordProblem(email: string, password: string, policy: PasswordPolicy = defaultPasswordPolicy()): PasswordProblem | null {
  const problem = (reason: PasswordProblemReason): PasswordProblem => ({ reason, policy })

  if (isWorkspaceEmail(email)) return problem('workspace-address')
  // Count characters as a person sees them, so an emoji or an accent is one, not four.
  const length = [...password].length
  if (length < policy.minLength) return problem('too-short')
  if (length > policy.maxLength) return problem('too-long')
  if (policy.requireMixedCase && !(/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password))) return problem('needs-mixed-case')
  if (policy.requireNumber && !/\p{Nd}/u.test(password)) return problem('needs-number')
  if (policy.requireSymbol && !/[^\p{L}\p{Nd}]/u.test(password)) return problem('needs-symbol')
  return null
}

// A session is only good while it matches the account it was sealed from (0007).
export function sessionIsCurrent(session: { epoch: number } | null, user: { sessionEpoch: number, disabled: boolean, anonymisedAt: number | null } | null): boolean {
  if (!session || !user) return false
  if (user.disabled || user.anonymisedAt !== null) return false
  return session.epoch === user.sessionEpoch
}
