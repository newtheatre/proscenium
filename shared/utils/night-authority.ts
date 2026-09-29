import { auditEntry } from './audit'
import { localPath } from './local-path'
import { saysRole } from './roles'
import { insideWindow } from './rota-times'
import type { AuditRow } from './audit'
import type { Permission, Role } from './roles'

// The vocabulary shift-scoped authority stands on (E-111, 0044). The guard that refuses a request
// is `server/utils/night-authority.ts`; nothing here reads a request or the database.

export const NIGHT_ROLES = ['DUTY_MANAGER', 'DOOR', 'BAR'] as const
export type NightRole = (typeof NIGHT_ROLES)[number]

// How the authority was reached. A refusal never returns; COVER is tonight's confirmed duty
// manager opening the door for their own performance (0095).
export type NightAuthorityVia = 'SHIFT' | 'OFFICER' | 'COVER'

export const OFFICER_BYPASS_ACTION = 'night.officer-bypass'

// The bypass permission each shift role stands on. A door shift does not open the till, so no two
// shift roles share one (E-111 criterion 1); the one officer role holds all three (0110).
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
  BAR: { role: 'FOH_MANAGER', words: 'the Front of House Manager\'s role' },
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

// On shift is a confirmed shift's own window, widened by the grace, read exactly as the guard reads
// it, so the chrome never offers Tonight to somebody the guard would send away (0078, 0094).
export function onShiftAt(
  windows: readonly { startsAt: number | null, endsAt: number | null }[],
  at: number,
  graceMinutes: number,
): boolean {
  return windows.some(window => insideWindow(window, at, graceMinutes))
}

// Somebody can work tonight on a shift in its window, or by a night permission (0044): the one
// fact the session carries, the menu reads and the hub is offered by (0094).
export function worksTonight(viewer: { onShiftTonight: boolean, permissions: readonly string[] }): boolean {
  if (viewer.onShiftTonight) return true
  return NIGHT_ROLES.some(role => viewer.permissions.includes(NIGHT_ROLE_PERMISSION[role]))
}

// An explicit `next` on this site always wins, the home page included; with none, somebody on
// shift lands on Tonight. Anything but a local path is no `next`, or sign-in is an open redirect.
export function landingAfterSignIn(next: unknown, onShiftTonight: boolean): string {
  return localPath(next) ?? (onShiftTonight ? '/tonight' : '/')
}

// A confirmed duty manager for the door's performance; the first name only for somebody on tonight's
// team there, since anyone signed in can be refused at the door (issue 1306).
export interface DoorHelp { firstName: string | null }

// Names both ways in, because a volunteer refused at 19:20 needs to know which one to go and get.
// The administrator is not offered: "become an administrator" is not advice (0044).
export function nightAuthorityRefusal(role: NightRole, dutyManager: DoorHelp | null = null): { statusCode: 403, statusMessage: string } {
  // The bar has a third way in, because an evening with no performance still opens a bar (0077).
  const tonight = role === 'BAR'
    ? `on one of tonight's performances or on tonight's bar opening`
    : `on one of tonight's performances`
  // Tonight's confirmed duty manager covers the door, so a door refusal says who can open it (0095).
  const who = dutyManager?.firstName ? `${dutyManager.firstName}, tonight's duty manager,` : 'Tonight\'s duty manager'
  const cover = role === 'DOOR' && dutyManager ? `. ${who} can open the door` : ''
  return {
    statusCode: 403,
    statusMessage: `This needs ${NIGHT_ROLE_WORDS[role]} ${tonight}, or ${NIGHT_ROLE_OFFICER[role].words}${cover}`,
  }
}

// Whoever confirms a queued claim (E-105): a unit test fails when this role stops holding
// `rota.write`, so the refusal below cannot send a volunteer to somebody who cannot help.
export const CLAIM_CONFIRMER: Role = 'FOH_MANAGER'

const CLAIMED_ROLE_WORDS: Record<NightRole, string> = { DUTY_MANAGER: 'duty manager', DOOR: 'door', BAR: 'bar' }

// A claim waiting for an officer is not a shift yet, and not nothing: the refusal says which, and
// who turns it into one (E-112 criterion 2, E-104).
export function claimedShiftRefusal(role: NightRole): { statusCode: 403, statusMessage: string } {
  return {
    statusCode: 403,
    statusMessage: `Your ${CLAIMED_ROLE_WORDS[role]} shift tonight is claimed, not confirmed yet: the ${saysRole(CLAIM_CONFIRMER)} confirms it on the rota`,
  }
}

// A confirmed duty manager shift whose holder holds no live committee role opens nothing, and
// says what is missing rather than that there is no shift (0114, E-111 criterion 1).
export function committeeShiftRefusal(): { statusCode: 403, statusMessage: string } {
  return {
    statusCode: 403,
    statusMessage: 'Your duty manager shift tonight opens nothing: a duty manager shift is for committee members, and you do not hold a committee role',
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

// Looking is not standing in: a read records no bypass unless it decrypts access-profile wording
// (D-127) and asks to be recorded; every write records (0098, amending 0044).
export function bypassIsRecorded(method: string, recordsRead = false): boolean {
  return recordsRead || !['GET', 'HEAD'].includes(method.toUpperCase())
}

// A read several roles reach decrypts for some of them only, so it may name which (0098).
export type RecordsRead = boolean | ((role: NightRole) => boolean)

export function recordsReadFor(recordsRead: RecordsRead | undefined, role: NightRole): boolean {
  return typeof recordsRead === 'function' ? recordsRead(role) : recordsRead === true
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

// Why one role refused a caller, most specific first: a shift's hours, the request or an officer's
// standing, a shift its holder's standing cannot use (0114), a claim waiting, no shift (E-111).
export const NIGHT_REFUSAL_KINDS = ['OUTSIDE_WINDOW', 'ASKED', 'NO_STANDING', 'CLAIMED', 'NO_SHIFT'] as const
export type NightRefusalKind = (typeof NIGHT_REFUSAL_KINDS)[number]

// The refusal a screen more than one role reaches shows: the most specific, and among equals the
// first role asked, so a door claimant is never answered in the bar's words.
export function mostSpecificRefusal<T extends { kind: NightRefusalKind }>(refusals: readonly T[]): T | undefined {
  let best: T | undefined
  for (const refusal of refusals) {
    if (!best || NIGHT_REFUSAL_KINDS.indexOf(refusal.kind) < NIGHT_REFUSAL_KINDS.indexOf(best.kind)) best = refusal
  }
  return best
}

// The dedupe key, carried in the audit row's target. Two venues may run one night and one venue
// may run a matinee and an evening, so the venue is in the key and the performance is not (0044).
export function officerBypassTarget(night: string, venueId: string, role: NightRole): string {
  return `night:${night}:${venueId}:${role}`
}

export const DOOR_COVER_ACTION = 'night.door-cover'

// Once per duty manager, night and venue, the same key a bypass has without its role: cover is
// only ever the door (0095).
export function doorCoverTarget(night: string, venueId: string): string {
  return `door-cover:${night}:${venueId}`
}

// Identifiers only, the venue's performances covered by the duty manager's shifts (0011).
export function doorCoverEntry(actorId: string, night: string, venueId: string, performanceIds: string[]): AuditRow {
  return auditEntry({
    actorId,
    action: DOOR_COVER_ACTION,
    target: doorCoverTarget(night, venueId),
    detail: { night, venueId, performanceIds },
  })
}

// The night report's cover line: a shift being worked, never an officer standing in (0095).
export function saysDoorCover(dutyManagerName: string | null): string {
  return dutyManagerName
    ? `Door: ${dutyManagerName} covered it from the duty manager's shift`
    : 'Door: the duty manager covered it from their own shift'
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
