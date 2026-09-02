// Every action the trail may carry. Writing one that is not here is refused, so a typo cannot
// quietly create a category and the screen always has a label to show (J-101 criterion 5).

// The backlog module an action belongs to, declared rather than parsed out of the action's first
// segment. `unknown` is what an unregistered action reads as, and nothing ever writes it.
export const AUDIT_MODULES = ['identity', 'governance', 'spaces', 'training'] as const
export const UNKNOWN_MODULE = 'unknown'

export type AuditModule = (typeof AUDIT_MODULES)[number]

// What a reader gets: the module widens, because an unregistered action belongs to none.
export interface DescribedAction {
  label: string
  module: AuditModule | typeof UNKNOWN_MODULE
  manual?: true
}

export interface AuditActionType {
  label: string
  module: AuditModule
  // A person acted on their own account. The screen says so rather than naming an officer.
  self?: true
  // Recorded after the fact by an officer, for something that happened outside the system.
  manual?: true
}

const CATALOGUE = {
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
  'session.started.passkey': { label: 'Signed in with a passkey', module: 'identity', self: true },
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
  // Written by scripts/grant-admin.ts, which is the one writer outside a request (K-122).
  'role.granted.bootstrap': { label: 'Administrator bootstrapped', module: 'identity' },

  'membership.granted': { label: 'Membership recorded', module: 'identity' },
  'membership.confirmed': { label: 'Membership confirmed', module: 'identity' },
  'membership.exported': { label: 'Membership register exported', module: 'governance' },
  'account.method.added': { label: 'Sign-in method added', module: 'identity', self: true },
  'account.method.removed': { label: 'Sign-in method removed', module: 'identity', self: true },
  'account.email.changed': { label: 'Email address changed', module: 'identity', self: true },
  'account.email.changed.admin': { label: 'Email address changed by an officer', module: 'identity' },
  'account.profile.updated': { label: 'Profile updated', module: 'identity', self: true },
  'account.student-id.recorded': { label: 'Student number recorded', module: 'identity' },

  'room.created': { label: 'Room added', module: 'spaces' },
  'room.updated': { label: 'Room changed', module: 'spaces' },
  'room.booked': { label: 'Room booked', module: 'spaces', self: true },
  'room.requested': { label: 'Room requested', module: 'spaces', self: true },
  'room.request.expired': { label: 'Room request lapsed', module: 'spaces' },
  'room.request.approved': { label: 'Room request approved', module: 'spaces' },
  'room.request.rejected': { label: 'Room request rejected', module: 'spaces' },
  'room.series.booked': { label: 'Room series booked', module: 'spaces', self: true },
  'room.series.requested': { label: 'Room series requested', module: 'spaces', self: true },
  'room.series.cancelled': { label: 'Room series cancelled', module: 'spaces', self: true },
  'account.calendar-feed.issued': { label: 'Calendar feed link minted', module: 'spaces', self: true },
  'room.booking.cancelled': { label: 'Room booking cancelled', module: 'spaces', self: true },
  'room.hours.set': { label: 'Room opening hours set', module: 'spaces' },
  'room.blackout.created': { label: 'Room closed', module: 'spaces' },
  'room.blackout.removed': { label: 'Room reopened', module: 'spaces' },
  'room.booking.bumped': { label: 'Room booking bumped', module: 'spaces' },
  'room.no-show.recorded': { label: 'No-show recorded', module: 'spaces' },
  'room.no-show.withdrawn': { label: 'No-show withdrawn', module: 'spaces' },
  'external.space.created': { label: 'Other room listed', module: 'spaces' },
  'external.space.updated': { label: 'Other room changed', module: 'spaces' },
  'external.space.note.set': { label: 'Other room suitability noted', module: 'spaces' },
  'external.space.note.removed': { label: 'Other room suitability note removed', module: 'spaces' },
  'external.requested': { label: 'Other room asked for', module: 'spaces', self: true },
  'external.request.submitted': { label: 'Other room form submitted', module: 'spaces' },
  'external.request.assigned': { label: 'Other room recorded', module: 'spaces' },
  'external.request.assignment.refused': { label: 'Other room refused as unsuitable', module: 'spaces' },
  'external.request.rejected': { label: 'Other room request turned down', module: 'spaces' },
  'external.request.cancelled': { label: 'Other room request withdrawn', module: 'spaces', self: true },
  'room.request.unlisted': { label: 'Request moved to a room we do not manage', module: 'spaces' },
  'external.request.relisted': { label: 'Request moved into one of our rooms', module: 'spaces' },

  'department.created': { label: 'Department added', module: 'training' },
  'department.updated': { label: 'Department changed', module: 'training' },
  'department.lead.assigned': { label: 'Department lead assigned', module: 'training' },
  'department.lead.removed': { label: 'Department lead removed', module: 'training' },
  'module.created': { label: 'Training module added', module: 'training' },
  'module.updated': { label: 'Training module changed', module: 'training' },
  'prerequisite.added': { label: 'Prerequisite added', module: 'training' },
  'prerequisite.removed': { label: 'Prerequisite removed', module: 'training' },

  // An honour rather than authority, so it sits with governance and not with identity (0023).
  'fellowship.awarded': { label: 'Fellowship awarded', module: 'governance' },
  'fellowship.revoked': { label: 'Fellowship revoked', module: 'governance' },

  'config.changed': { label: 'Setting changed', module: 'governance' },
  'audit.exported': { label: 'Audit trail exported', module: 'governance' },

  // Recorded after the fact, for a decision taken outside the system. The vocabulary grows with
  // the modules: there is no general-purpose manual action, because that is a note (J-103).
  'manual.role.granted': { label: 'Role granted outside the system', module: 'governance', manual: true },
  'manual.role.revoked': { label: 'Role revoked outside the system', module: 'governance', manual: true },
  'manual.account.disabled': { label: 'Account disabled outside the system', module: 'governance', manual: true },
  'manual.account.enabled': { label: 'Account enabled outside the system', module: 'governance', manual: true },
} as const satisfies Record<string, AuditActionType>

export type AuditActionName = keyof typeof CATALOGUE

// Widened on the way out: `as const` is what infers the names, and it also narrows every value to
// its own literal shape, so an optional flag looks absent on the entries that lack it.
export const AUDIT_ACTIONS: Record<AuditActionName, AuditActionType> = CATALOGUE

export const AUDIT_ACTION_NAMES = Object.keys(AUDIT_ACTIONS) as AuditActionName[]

export function isAuditAction(name: string): name is AuditActionName {
  return Object.hasOwn(AUDIT_ACTIONS, name)
}

// Only these may be written by hand, and the namespace is enforced at the write path so a manual
// entry can never claim an action the system performs (J-103 criterion 2).
export const MANUAL_ACTION_NAMES = AUDIT_ACTION_NAMES.filter(name => AUDIT_ACTIONS[name].manual === true)

export function isManualAction(name: string): boolean {
  return isAuditAction(name) && AUDIT_ACTIONS[name].manual === true
}

// For reading rather than writing: the trail is history, and an entry written before a name was
// retired, or imported from the old estate (J-108), still has to render.
export function describeAction(name: string): DescribedAction {
  return isAuditAction(name) ? AUDIT_ACTIONS[name] : { label: name, module: UNKNOWN_MODULE }
}

// Registering an action is the decision; writing one is not. An unregistered name is a defect,
// so it throws rather than being recorded under a category nothing knows how to display.
export function auditAction(name: string): AuditActionType {
  if (!isAuditAction(name)) {
    throw new Error(`\`${name}\` is not a registered audit action: add it to the catalogue before writing it (J-101)`)
  }
  return AUDIT_ACTIONS[name]
}
