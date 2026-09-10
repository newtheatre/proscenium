import { nextCommitteeYearEnd } from './london'

// The officer roles, namespace-free. Provisional until the role-vocabulary workshop signs the
// mapping; migration/role-map.json maps the old estate's namespaced roles onto these.
export const ROLES = [
  'ADMIN',
  'MANAGER',
  'THEATRE_MANAGER',
  'TRAINING_MANAGER',
  'BOX_OFFICE',
  'FOH_MANAGER',
  'FRONT_OF_HOUSE',
  'BAR_MANAGER',
  'ACCESSIBILITY_OFFICER',
  'SAFETY_OFFICER',
  'TREASURER',
  'COMMITTEE',
] as const

export type Role = (typeof ROLES)[number]

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
  // Appointing a department's stewards is the administrator's, not the training officer's (G-110).
  'training.leads',
  // Taking a record away is the administrator's (G-122 criterion 1), and so is signing one off as
  // never expiring, which is break-glass and absent from every screen (G-120 criterion 5).
  'training.revoke',
  'training.override',
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
  // Approving a refund: general box office is not enough (D-116 criterion 2). Tonight's
  // confirmed duty manager reaches the same approval without holding it (0009).
  'money.refund',
  // Deciding an access profile declaration: sighting evidence, agreeing the door's wording. A
  // named accessibility officer's, never general box office's (D-127 criterion 2).
  'access.verify',
  // The bar's catalogue and its stock register: sit-down work the bar manager and an
  // administrator do. Selling over the bar is operational and derives from tonight (0009, F-111).
  'bar.read',
  'bar.write',
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
  // The safety officer's own standing work: configuring which severities route to them, reading
  // and closing the open-items list. Neither derives from a shift (0009, E-116).
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
  // The season dashboard's aggregate figures, without the entry-level drill-down `finance.read`
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
  ADMIN: PERMISSIONS,
  MANAGER: ['accounts.read', 'audit.read', 'audit.write', 'config.read', 'fellowships.read', 'fellowships.write', 'members.read', 'members.write', 'money.refund', 'rooms.read', 'rooms.write', 'ticketing.manage', 'training.read', 'training.write'],
  // J-103's story is the Theatre Manager's: they are who searches the trail and records what
  // happened outside the system.
  THEATRE_MANAGER: ['accounts.read', 'audit.read', 'audit.write', 'config.read', 'fellowships.read', 'members.read', 'rooms.read', 'rooms.write', 'training.read'],
  // Owns the catalogue and appoints its stewards; `training.override` stays ADMIN because
  // never-expiring is the rarer break-glass (G-107, G-110, questions 7 and 8).
  TRAINING_MANAGER: ['accounts.read', 'members.read', 'rooms.read', 'training.leads', 'training.read', 'training.revoke', 'training.write'],
  // Owns the programme's configuration. Nothing operational is here: the door and the desk
  // derive from tonight's performance and shift (0009).
  BOX_OFFICE: ['ticketing.read', 'ticketing.write', 'ticketing.export'],
  // Administers the rota in advance, and opens the door and duty manager screens without a shift
  // tonight. The till is the bar manager's (0044, 0046, E-101 criterion 2).
  FOH_MANAGER: ['night.door', 'night.manage', 'rota.read', 'rota.write', 'checklist.read', 'checklist.write', 'emergency-card.read', 'emergency-card.write', 'age-checks.export', 'board.read', 'board.write', 'reports.read'],
  FRONT_OF_HOUSE: [],
  // Owns the bar's catalogue and its stock, and opens the till without a bar shift. Nothing in
  // the old estate grants this role, so the import cannot reach it (0044, F-101 criterion 1).
  BAR_MANAGER: ['bar.read', 'bar.write', 'night.till'],
  // Verifies access profile declarations and nothing else: sighting evidence and agreeing the
  // door's wording is the whole of the job (D-127 criterion 2).
  ACCESSIBILITY_OFFICER: ['access.verify'],
  // Configures which severities route to them, and reads and closes the open-items list.
  // Nothing in the old estate grants this role, so the import cannot reach it (E-116).
  SAFETY_OFFICER: ['safety.read', 'safety.write', 'reports.read'],
  // Reads the ledger and everything built on it. Nothing in the old estate grants this role, so
  // the import cannot reach it (I-103).
  TREASURER: ['finance.read', 'finance.write', 'finance.export'],
  // Season aggregates only, matching `finance.summary`'s own reasoning: trends across a season
  // (E-126), never the entry-level drill-down into one night (I-105 criterion 5).
  COMMITTEE: ['finance.summary', 'reports.read'],
}

// Any role holding a permission no other role does; losing the last holder locks everyone out.
export const PROTECTED_ROLE: Role = 'ADMIN'

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

const ROLE_WORDING: Record<Role, string> = {
  ADMIN: 'IT Manager',
  MANAGER: 'Manager',
  THEATRE_MANAGER: 'Theatre Manager',
  TRAINING_MANAGER: 'Training Manager',
  BOX_OFFICE: 'Box office',
  FOH_MANAGER: 'Front of house manager',
  FRONT_OF_HOUSE: 'Front of house',
  BAR_MANAGER: 'Bar manager',
  ACCESSIBILITY_OFFICER: 'Accessibility officer',
  SAFETY_OFFICER: 'Safety officer',
  TREASURER: 'Treasurer',
  COMMITTEE: 'Committee',
}

// For a message a holder reads rather than a console filter. The vocabulary is provisional until
// the workshop signs the mapping, so an unregistered role reads as itself (0027's habit).
export function saysRole(role: string): string {
  return ROLE_WORDING[role as Role] ?? role
}
