// Every action the trail may carry. Writing one that is not here is refused, so a typo cannot
// quietly create a category and the screen always has a label to show (J-101 criterion 5).

// The backlog module an action belongs to. Reports and the audit screen group by this, which is
// why it is declared rather than parsed out of the action's first segment.
export const AUDIT_MODULES = ['identity', 'governance'] as const

export type AuditModule = (typeof AUDIT_MODULES)[number]

export interface AuditActionType {
  label: string
  module: AuditModule
  // A person acted on their own account. The screen says so rather than naming an officer.
  self?: true
  // Recorded after the fact by an officer, for something that happened outside the system.
  manual?: true
}

export const AUDIT_ACTIONS = {
  'account.registered': { label: 'Account registered', module: 'identity', self: true },
  'account.created.console': { label: 'Account created from the console', module: 'identity' },
  'account.created.google': { label: 'Account created by Google sign-in', module: 'identity', self: true },
  'account.verified': { label: 'Address confirmed', module: 'identity', self: true },
  'account.disabled': { label: 'Account disabled', module: 'identity' },
  'account.enabled': { label: 'Account enabled', module: 'identity' },
  'account.exported': { label: 'Data exported', module: 'identity', self: true },
  'account.erased': { label: 'Account closed by its owner', module: 'identity', self: true },
  'account.erased.admin': { label: 'Account erased by an officer', module: 'identity' },
  'account.erased.system': { label: 'Account erased automatically', module: 'identity' },

  'session.started': { label: 'Signed in with a password', module: 'identity', self: true },
  'session.started.google': { label: 'Signed in with Google', module: 'identity', self: true },
  'session.started.magic-link': { label: 'Signed in with a link', module: 'identity', self: true },
  'session.started.totp': { label: 'Signed in with an authenticator', module: 'identity', self: true },
  'session.started.recovery-code': { label: 'Signed in with a recovery code', module: 'identity', self: true },
  'session.revoked': { label: 'Sessions ended by an officer', module: 'identity' },

  'password.set': { label: 'First password set', module: 'identity', self: true },
  'password.reset': { label: 'Password reset', module: 'identity', self: true },

  'mfa.challenged': { label: 'Second factor requested', module: 'identity', self: true },
  'mfa.confirmed': { label: 'Authenticator enrolled', module: 'identity', self: true },
  'mfa.removed': { label: 'Authenticator removed', module: 'identity', self: true },
  'mfa.reset': { label: 'Authenticator cleared by an officer', module: 'identity' },
  'mfa.recovery-codes.minted': { label: 'Recovery codes minted', module: 'identity', self: true },

  'role.granted': { label: 'Role granted', module: 'identity' },
  'role.revoked': { label: 'Role revoked', module: 'identity' },

  'config.changed': { label: 'Setting changed', module: 'governance' },
} as const satisfies Record<string, AuditActionType>

export type AuditActionName = keyof typeof AUDIT_ACTIONS

export const AUDIT_ACTION_NAMES = Object.keys(AUDIT_ACTIONS) as AuditActionName[]

export function isAuditAction(name: string): name is AuditActionName {
  return Object.hasOwn(AUDIT_ACTIONS, name)
}

// Registering an action is the decision; writing one is not. An unregistered name is a defect,
// so it throws rather than being recorded under a category nothing knows how to display.
export function auditAction(name: string): AuditActionType {
  if (!isAuditAction(name)) {
    throw new Error(`\`${name}\` is not a registered audit action: add it to the catalogue before writing it (J-101)`)
  }
  return AUDIT_ACTIONS[name]
}
