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

// How a refusal says the shift out loud. `BAR` is a value in a column, not something to put in
// front of a volunteer, and British English is the rule for every piece of UI copy.
export const NIGHT_ROLE_WORDS: Record<NightRole, string> = {
  DUTY_MANAGER: 'a confirmed duty manager shift',
  DOOR: 'a confirmed door shift',
  BAR: 'a confirmed bar shift',
}

// The officer a refusal points at. A unit test fails when the role named here stops holding the
// permission above, so the advice cannot drift from the permission map (0044).
export const NIGHT_ROLE_OFFICER: Record<NightRole, { role: Role, words: string }> = {
  DUTY_MANAGER: { role: 'FOH_MANAGER', words: 'the Front of House Manager\'s role' },
  DOOR: { role: 'FOH_MANAGER', words: 'the Front of House Manager\'s role' },
  BAR: { role: 'BAR_MANAGER', words: 'the Bar Manager\'s role' },
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
  // The bar has a third way in, because an evening with no performance still opens a bar (0077).
  const tonight = role === 'BAR'
    ? `on one of tonight's performances or on tonight's bar opening`
    : `on one of tonight's performances`
  return {
    statusCode: 403,
    statusMessage: `This needs ${NIGHT_ROLE_WORDS[role]} ${tonight}, or ${NIGHT_ROLE_OFFICER[role].words}`,
  }
}

// Somebody holding tonight's shift outside the hours they work it is not somebody without one, so
// the refusal quotes the window in London wall clock rather than the ways in (0078, E-131).
export function outsideWindowRefusal(window: string): { statusCode: 403, statusMessage: string } {
  return {
    statusCode: 403,
    statusMessage: `Your shift opens this from ${window}, and it is outside those hours`,
  }
}

// Looking is not standing in: a read records no bypass unless it shows what only tonight's team
// may see and asks to be recorded; every write records (0098, amending 0044).
export function bypassIsRecorded(method: string, recordsRead = false): boolean {
  return recordsRead || !['GET', 'HEAD'].includes(method.toUpperCase())
}

const BYPASS_ROLE_WORDS: Record<NightRole, string> = { DUTY_MANAGER: 'duty manager', DOOR: 'door', BAR: 'bar' }

export interface OfficerBypassLine { role: NightRole, officerName: string | null, confirmedShift: boolean }

// One night report line per role an officer stood in for, and whether tonight's rota had that
// role confirmed anyway, which is a question about the rota of its own (E-123, 0098).
export function saysOfficerBypass(line: OfficerBypassLine): string {
  const words = BYPASS_ROLE_WORDS[line.role]
  const who = line.officerName ?? 'an officer'
  const beside = line.confirmedShift ? `beside a confirmed ${words} shift` : `with no confirmed ${words} shift`
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}: ${who} stood in by officer role, ${beside}`
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
  // Named where the evening was a bar opening, so the night report can say which one (0077).
  openingId?: string,
): AuditRow {
  return auditEntry({
    actorId,
    action: OFFICER_BYPASS_ACTION,
    target: officerBypassTarget(night, venueId, role),
    detail: { role, night, venueId, performanceIds, ...(openingId ? { openingId } : {}) },
  })
}
