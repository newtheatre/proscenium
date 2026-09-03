import { auditEntry } from './audit'
import type { AuditRow } from './audit'
import type { Permission, Role } from './roles'

// The vocabulary shift-scoped authority stands on (E-111, 0044). The guard that refuses a request
// is `server/utils/night-authority.ts`; nothing here reads a request or the database.

export const NIGHT_ROLES = ['DUTY_MANAGER', 'DOOR', 'BAR'] as const
export type NightRole = (typeof NIGHT_ROLES)[number]

// How the authority was reached. A refusal never returns, so there is no third state.
export type NightAuthorityVia = 'SHIFT' | 'OFFICER'

export const OFFICER_BYPASS_ACTION = 'night.officer-bypass'

// The bypass permission each role stands on. A door shift does not open the till and neither does
// the front of house officer's role, so no two roles share one (E-111 criterion 1).
export const NIGHT_ROLE_PERMISSION: Record<NightRole, Permission> = {
  DUTY_MANAGER: 'night.manage',
  DOOR: 'night.door',
  BAR: 'night.till',
}

// The officer a refusal points at. A unit test fails when the role named here stops holding the
// permission above, so the advice cannot drift from the permission map (0044).
export const NIGHT_ROLE_OFFICER: Record<NightRole, { role: Role, words: string }> = {
  DUTY_MANAGER: { role: 'FOH_MANAGER', words: 'the front of house manager\'s role' },
  DOOR: { role: 'FOH_MANAGER', words: 'the front of house manager\'s role' },
  BAR: { role: 'BAR_MANAGER', words: 'the bar manager\'s role' },
}

// What the caller says it is working on. Every field is optional because the common case is
// tonight at the one venue running; a night that is not tonight is refused, never resolved.
export interface NightScope {
  night?: string
  venueId?: string
  performanceId?: string
}

export function isNightRole(value: string): value is NightRole {
  return (NIGHT_ROLES as readonly string[]).includes(value)
}

// Names both ways in, because a volunteer refused at 19:20 needs to know which one to go and get.
// The administrator is not offered: "become an administrator" is not advice (0044).
export function nightAuthorityRefusal(role: NightRole): { statusCode: 403, statusMessage: string } {
  return {
    statusCode: 403,
    statusMessage: `This needs a confirmed ${role} shift on one of tonight's performances, or ${NIGHT_ROLE_OFFICER[role].words}`,
  }
}

// The dedupe key, carried in the audit row's target. Two venues may run one night and one venue
// may run a matinee and an evening, so the venue is in the key and the performance is not (0044).
export function officerBypassTarget(night: string, venueId: string, role: NightRole): string {
  return `night:${night}:${venueId}:${role}`
}

// The detail carries the venue's whole night rather than the request's scope: the row is written
// once, and a later request may cover a performance this one did not (E-127 criterion 1).
export function officerBypassEntry(
  actorId: string,
  night: string,
  venueId: string,
  role: NightRole,
  performanceIds: string[],
): AuditRow {
  return auditEntry({
    actorId,
    action: OFFICER_BYPASS_ACTION,
    target: officerBypassTarget(night, venueId, role),
    detail: { role, night, venueId, performanceIds },
  })
}
