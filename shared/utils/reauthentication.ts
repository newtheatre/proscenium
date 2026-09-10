import type { SessionFactor } from '#shared/utils/session-factor'

export type ReauthKind = 'password' | 'passkey' | 'google'

export interface ReauthOption {
  kind: ReauthKind
  // Only meaningful for 'password': whether a code rides with it (A-128 criterion 3).
  secondFactor?: boolean
}

export interface ReauthAccountState {
  factor: SessionFactor
  hasPassword: boolean
  hasConfirmedTotp: boolean
  hasPasskey: boolean
}

// What the modal may accept, at least as strong as what opened the session: a passkey session
// re-asserts only a passkey, and a Workspace session is never offered a password (A-128).
export function reauthOptions(state: ReauthAccountState): ReauthOption[] {
  if (state.factor === 'passkey') return [{ kind: 'passkey' }]

  if (state.factor === 'google') {
    return state.hasPasskey ? [{ kind: 'google' }, { kind: 'passkey' }] : [{ kind: 'google' }]
  }

  if (state.hasPassword) return [{ kind: 'password', secondFactor: state.hasConfirmedTotp }]
  // A password-less, non-Workspace session with no passkey either has no reassertion path left:
  // the caller falls back to full re-entry (A-128 criterion 6).
  return state.hasPasskey ? [{ kind: 'passkey' }] : []
}
