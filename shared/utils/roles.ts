import { nextCommitteeYearEnd } from './london'

// One role per committee post with standing work, `COMMITTEE` for every other post, and `ADMIN`
// for the Archivist's IT function (0113); migration/role-map.json maps the old estate onto these.
export const ROLES = [
  'ADMIN',
  'PRESIDENT',
  'SECRETARY',
  'TREASURER',
  'FOH_MANAGER',
  'THEATRE_MANAGER',
  'COMMITTEE',
] as const

export type Role = (typeof ROLES)[number]

// What "the Committee" means wherever a rule names it: any post role. `ADMIN` is a function its
// delegate may hold without a post, so it carries no committee standing (0113).
export const COMMITTEE_ROLES: readonly Role[] = ['PRESIDENT', 'SECRETARY', 'TREASURER', 'FOH_MANAGER', 'THEATRE_MANAGER', 'COMMITTEE']

// A stored list naming `COMMITTEE` means every post role, so a setting or an audience written as
// "the Committee" reaches a post holder who holds one grant, not two (0113).
export function withCommitteeStanding(roles: readonly string[]): string[] {
  return roles.includes('COMMITTEE') ? [...new Set([...roles, ...COMMITTEE_ROLES])] : [...roles]
}

// Standing permissions are administrative only, with one named exception at the bottom of the
// list. Operational authority derives from tonight's facts and is not granted in advance (0009).
export const PERMISSIONS = [
  'accounts.read',
  'accounts.create',
  'accounts.disable',
  'accounts.merge',
  'roles.grant',
  'roles.revoke',
  'audit.read',
  'audit.write',
  'fellowships.read',
  'fellowships.write',
  'members.read',
  'members.write',
  'config.read',
  'config.write',
  // Recording and reading restore drills: the IT Manager's, alongside the settings they gate (K-108, J-107).
  'backups.read',
  'backups.write',
  'rooms.read',
  'rooms.write',
  'training.read',
  'training.write',
  // Appointing a department's stewards: the Theatre Manager's, as owner of the catalogue (G-110, 0112).
  'training.leads',
  // Taking a record away is the Theatre Manager's (G-122 criterion 1, 0112); signing one off as
  // never expiring is the IT Manager's break-glass, absent from every screen (G-120 criterion 5).
  'training.revoke',
  'training.override',
  // Making an account only as the subject of the record written with it, never Add someone's
  // `accounts.create`; a lead of the module's department derives the same (0091).
  'training.by-address',
  // The programme's configuration: ticket types, their prices and, from D-120, the overrides
  // over them. Selling a ticket is operational and derives from tonight (0009).
  'ticketing.read',
  'ticketing.write',
  // Narrowing what a pass product already covers once it has live passes against it: general
  // box office is not enough, echoing D-117's comp approval (D-123 criterion 4).
  'ticketing.manage',
  // Taking a copy of season sales for reporting: general box office duty, distinct from the
  // programme's own configuration (D-129).
  'ticketing.export',
  // Approving a paid refund at the desk (D-116 criterion 2): a standing grant held with the desk,
  // never derived from a shift (0102).
  'money.refund',
  // Deciding an access profile declaration: sighting evidence, agreeing the door's wording. The
  // Secretary and Welfare Officer's, never general box office's (D-127 criterion 2, 0113).
  'access.verify',
  // The bar's catalogue and its stock register: the Front of House Manager's sit-down work
  // (0111). Selling over the bar is operational and derives from tonight (0009, F-111).
  'bar.read',
  'bar.write',
  // Opening, counting and applying a stocktake, without the catalogue or the rest of the register
  // (0099). The Front of House Manager holds it beside `bar.write` since the bar joined the post (0111).
  'bar.stocktake',
  // The rota is planned days ahead at a desk, so administering it is a standing permission like
  // the programme's. Working tonight is not, and derives from a shift (0009, 0046).
  'rota.read',
  'rota.write',
  // The pre and post-show checklist's committee configuration: planned ahead like the rota is,
  // never operational (0009, E-114).
  'checklist.read',
  'checklist.write',
  // The venue emergency card: committee-editable, cached for reading, never a standing grant
  // over anything operational (E-113).
  'emergency-card.read',
  'emergency-card.write',
  // The Theatre Manager's safety work: which severities route to them, reading and closing the
  // open-items list, which the President also reads (0112, 0113). Never from a shift (E-116).
  'safety.read',
  'safety.write',
  // Exporting the licensing register's history. A shift alone reads tonight's entries; taking a
  // copy of the whole register for an inspection is the standing officer's (E-119 criterion 4).
  'age-checks.export',
  // The backstage board's milestone types and presets: committee configuration, planned ahead
  // like the checklist's, not the join or the reset, which are tonight's own (E-121, E-122).
  'board.read',
  'board.write',
  // The one exception to the rule above, and it is named, bounded and audited: a designated
  // officer opens tonight's screens without a shift, and every use is recorded (0044, E-111).
  'night.door',
  'night.till',
  'night.manage',
  // The treasurer's own read over the ledger: comps, discounts and the reports built on them.
  // No distinct permission existed before I-103; every report routed through `bar.read` instead.
  'finance.read',
  // Composing a fan-out to a resolved audience (H-108). Open question 1 asks which roles beyond
  // ADMIN and whether a whole-membership send needs a second officer; unanswered, so narrow.
  'comms.announce',
  // The send log and one person's history within it, the latter audited on its own (H-106
  // criterion 5). Who beyond ADMIN holds this awaits the same open question.
  'comms.operations',
  // Recording a daily Z reading and resolving a variance: the treasurer's own write (I-104).
  'finance.write',
  // The money dashboard's aggregate figures, without the entry-level drill-down `finance.read`
  // carries (I-105 criterion 5): the committee sees how the season is doing, not who rang it in.
  'finance.summary',
  // Reopening a closed period. Deliberately not TREASURER's: I-107 criterion 4 asks for an
  // administrator, so ADMIN's automatic grant of every permission is what answers it.
  'finance.reopen',
  // Taking a copy of a period shaped for the SU's own accounting: general finance reading is
  // not enough, echoing D-129's own distinct `ticketing.export` (I-108).
  'finance.export',
  // Cross-season incident, attendance and staffing trends: aggregate figures over the operational
  // tables, never a standing grant over any one night's own screens (E-126).
  'reports.read',
] as const

export type Permission = (typeof PERMISSIONS)[number]

// The exception's members, listed so "holds a standing permission" keeps meaning "does
// administrative work": an officer bypass opens tonight's screens and never the console (0044).
export const OPERATIONAL_PERMISSIONS: readonly Permission[] = ['night.door', 'night.till', 'night.manage']

// Deliberately sparse: a role earns a permission when the thing it unlocks exists. Guessing
// now would grant authority over features nobody has reviewed.
export const PERMISSION_MAP: Record<Role, readonly Permission[]> = {
  // Every permission, deliberately: the IT Manager is the recovery route for every other post (0114).
  ADMIN: PERMISSIONS,
  // Oversight of committee members reads the trail (4.1.2), and safety is shared with the Theatre
  // Manager (4.1.1), so it reads incident text: a named widening of health data (0113).
  PRESIDENT: ['accounts.read', 'audit.read', 'audit.write', 'safety.read', 'reports.read', 'finance.summary'],
  // The official welfare officer verifies access declarations, never the box office (D-127
  // criterion 2), and runs the fellowship meeting (4.2.1, 3.7.1, 0113).
  SECRETARY: ['access.verify', 'fellowships.read', 'reports.read', 'finance.summary'],
  // Keeps the record and resolves discrepancies, and never takes the money (4.3, 7.2). Reopening a
  // period stays the IT Manager's (I-107 criterion 4).
  TREASURER: ['finance.read', 'finance.write', 'finance.export', 'finance.summary', 'reports.read'],
  // Sales and the bar, the reader, the rota and show nights (4.4.1 to 4.4.3): all three night
  // permissions in one grant (0044, 0090, 0102, 0111). Never `finance.write` or `access.verify`.
  FOH_MANAGER: ['ticketing.read', 'ticketing.write', 'ticketing.export', 'money.refund', 'bar.read', 'bar.write', 'bar.stocktake', 'night.door', 'night.till', 'night.manage', 'rota.read', 'rota.write', 'checklist.read', 'checklist.write', 'emergency-card.read', 'emergency-card.write', 'age-checks.export', 'board.read', 'board.write', 'reports.read', 'finance.summary'],
  // Spaces, health and safety, and the training catalogue with its leads (4.11.4, 4.11.6, 6.5,
  // 9.6, 0112). `training.override` stays the IT Manager's break-glass (G-120 criterion 5).
  THEATRE_MANAGER: ['accounts.read', 'members.read', 'config.read', 'rooms.read', 'rooms.write', 'safety.read', 'safety.write', 'training.read', 'training.write', 'training.leads', 'training.revoke', 'training.by-address', 'emergency-card.read', 'emergency-card.write', 'reports.read', 'finance.summary'],
  // Season aggregates only (E-126, I-105 criterion 5). Every post role carries these too, so a
  // post holder never needs this grant beside their own (0113).
  COMMITTEE: ['finance.summary', 'reports.read'],
}

// Any role holding a permission no other role does; losing the last holder locks everyone out.
export const PROTECTED_ROLE: Role = 'ADMIN'

export const SELF_GRANT = 'Nobody grants themselves a role. Ask another IT Manager to make this grant.'

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

export interface Grant {
  role: Role
  expiresAt: number | null
}

// Enforced at read time, so a grant that lapsed overnight stops working without a sweep having
// to run first (0009).
export function isGrantLive(grant: Grant, now: Date): boolean {
  return grant.expiresAt === null || grant.expiresAt * 1000 > now.getTime()
}

export function permissionsFor(grants: Grant[], now: Date): Set<Permission> {
  const held = new Set<Permission>()
  for (const grant of grants) {
    if (!isGrantLive(grant, now)) continue
    for (const permission of PERMISSION_MAP[grant.role] ?? []) held.add(permission)
  }
  return held
}

// What a grant made now expires at, unless it is explicitly permanent (0009, 0014).
export function defaultRoleExpiry(now: Date): number {
  return Math.floor(nextCommitteeYearEnd(now).getTime() / 1000)
}

// Proper titles, Title Case wherever they are read, sentence-initial or not: the rest of the
// codebase writes "the IT Manager", and a sentence-case map would split it two ways (K-128).
const ROLE_WORDING: Record<Role, string> = {
  ADMIN: 'IT Manager',
  PRESIDENT: 'President',
  SECRETARY: 'Secretary and Welfare Officer',
  TREASURER: 'Treasurer',
  FOH_MANAGER: 'Front of House Manager',
  THEATRE_MANAGER: 'Theatre Manager',
  COMMITTEE: 'Committee',
}

// Grantable no longer, but named by audit entries written before they were retired (0090, 0113).
const RETIRED_ROLE_WORDING: Record<string, string> = {
  BOX_OFFICE: 'Box Office Manager',
  FRONT_OF_HOUSE: 'Front of House',
  MANAGER: 'Manager',
  BAR_MANAGER: 'Bar Manager',
  SAFETY_OFFICER: 'Safety Officer',
  TRAINING_MANAGER: 'Training Manager',
  ACCESSIBILITY_OFFICER: 'Accessibility Officer',
}

// For a message a holder reads rather than a console filter. The vocabulary is provisional until
// the workshop signs the mapping, so an unregistered role reads as itself (0027's habit).
export function saysRole(role: string): string {
  return ROLE_WORDING[role as Role] ?? RETIRED_ROLE_WORDING[role] ?? role
}
