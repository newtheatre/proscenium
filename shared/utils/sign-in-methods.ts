import { isWorkspaceEmail } from './auth'

// What an account can sign in with, and what may be taken away. Every path asks here, so the
// answer cannot differ between the account screen, an endpoint and an administrator (A-113).

export type MethodKind = 'password' | 'google' | 'passkey'

export interface PasskeySummary {
  id: string
  label: string | null
  createdAt: number
  lastUsedAt: number | null
}

export interface MethodSnapshot {
  email: string
  passwordSetAt: number | null
  passwordLastUsedAt: number | null
  googleSub: string | null
  googleLinkedAt: number | null
  googleLastUsedAt: number | null
  passkeys: PasskeySummary[]
}

export interface SignInMethod {
  kind: MethodKind
  // 'password', 'google', or the passkey's own id: what a removal names.
  id: string
  label: string
  addedAt: number | null
  lastUsedAt: number | null
  removable: boolean
}

const UNNAMED_PASSKEY = 'Unnamed passkey'

function present(snapshot: MethodSnapshot): SignInMethod[] {
  const methods: SignInMethod[] = []

  if (snapshot.passwordSetAt !== null) {
    methods.push({
      kind: 'password',
      id: 'password',
      label: 'Password',
      addedAt: snapshot.passwordSetAt,
      lastUsedAt: snapshot.passwordLastUsedAt,
      removable: false,
    })
  }
  if (snapshot.googleSub !== null) {
    methods.push({
      kind: 'google',
      id: 'google',
      label: 'Google',
      addedAt: snapshot.googleLinkedAt,
      lastUsedAt: snapshot.googleLastUsedAt,
      removable: false,
    })
  }
  for (const passkey of snapshot.passkeys) {
    methods.push({
      kind: 'passkey',
      id: passkey.id,
      label: passkey.label ?? UNNAMED_PASSKEY,
      addedAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
      removable: false,
    })
  }
  return methods
}

// Whether taking this one away would leave no way in. The screen reads it so a button it would
// refuse is never offered (criteria 1 and 5).
export function methodsOf(snapshot: MethodSnapshot): SignInMethod[] {
  const methods = present(snapshot)
  return methods.map(method => ({ ...method, removable: methods.length > 1 }))
}

export function refusalToRemove(snapshot: MethodSnapshot, id: string): string | null {
  const methods = present(snapshot)
  const going = methods.find(method => method.id === id)
  if (!going) return 'That sign-in method is not on this account'
  if (methods.length <= 1) return 'That is the only way into this account: add another before removing it'
  return null
}

// Decision 0008: no password may exist on a Workspace address, by any path including import.
export function refusalToAddPassword(account: { email: string }): string | null {
  return isWorkspaceEmail(account.email)
    ? 'That address signs in with Google and cannot hold a password'
    : null
}

export type SecurityStep = 'authenticator' | 'passkey'

export interface SecurityStanding {
  authenticatorRequired: boolean
  authenticatorConfirmed: boolean
  passkeySupported: boolean
  holdsPasskey: boolean
}

// The one step the security page puts first (issue 1344): an authenticator a role needs before
// anything (A-112), then a passkey where the browser can hold one and none is held (A-105).
export function securityNextStep(standing: SecurityStanding): SecurityStep | null {
  if (standing.authenticatorRequired && !standing.authenticatorConfirmed) return 'authenticator'
  if (standing.passkeySupported && !standing.holdsPasskey) return 'passkey'
  return null
}

// A name the owner gives a passkey, so two devices can be told apart when one is removed.
export const PASSKEY_LABEL_MAX = 60

export function passkeyLabelProblem(label: string): string | null {
  const trimmed = label.trim()
  if (!trimmed) return 'Give the passkey a name'
  if (trimmed.length > PASSKEY_LABEL_MAX) return `Keep the name to ${PASSKEY_LABEL_MAX} characters`
  return null
}

// A first guess from the browser, offered for the owner to keep or change: "Chrome on Android".
export function guessPasskeyLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent) ? 'Safari' : null
  const device = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'Mac'
          : /Windows/.test(userAgent) ? 'Windows' : /Linux/.test(userAgent) ? 'Linux' : null
  if (browser && device) return `${browser} on ${device}`
  return browser ?? device ?? 'This device'
}
