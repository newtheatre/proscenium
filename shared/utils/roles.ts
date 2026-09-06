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
  'COMMITTEE',
] as const

export type Role = (typeof ROLES)[number]

// Standing permissions are administrative only, with one named exception at the bottom of the
// list. Operational authority derives from tonight's facts and is not granted in advance (0009).
export const PERMISSIONS = [
  'accounts.read',
  'accounts.create',
  'accounts.disable',
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
  // The one exception to the rule above, and it is named, bounded and audited: a designated
  // officer opens tonight's screens without a shift, and every use is recorded (0044, E-111).
  'night.door',
  'night.till',
  'night.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

// The exception's members, listed so "holds a standing permission" keeps meaning "does
// administrative work": an officer bypass opens tonight's screens and never the console (0044).
export const OPERATIONAL_PERMISSIONS: readonly Permission[] = ['night.door', 'night.till', 'night.manage']

// Deliberately sparse: a role earns a permission when the thing it unlocks exists. Guessing
// now would grant authority over features nobody has reviewed.
export const PERMISSION_MAP: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: ['accounts.read', 'audit.read', 'audit.write', 'config.read', 'fellowships.read', 'fellowships.write', 'members.read', 'members.write', 'rooms.read', 'rooms.write', 'ticketing.manage', 'training.read', 'training.write'],
  // J-103's story is the Theatre Manager's: they are who searches the trail and records what
  // happened outside the system.
  THEATRE_MANAGER: ['accounts.read', 'audit.read', 'audit.write', 'config.read', 'fellowships.read', 'members.read', 'rooms.read', 'rooms.write', 'training.read'],
  // Owns the catalogue and appoints its stewards; `training.override` stays ADMIN because
  // never-expiring is the rarer break-glass (G-107, G-110, questions 7 and 8).
  TRAINING_MANAGER: ['accounts.read', 'members.read', 'rooms.read', 'training.leads', 'training.read', 'training.revoke', 'training.write'],
  // Owns the programme's configuration. Nothing operational is here: the door and the desk
  // derive from tonight's performance and shift (0009).
  BOX_OFFICE: ['ticketing.read', 'ticketing.write'],
  // Administers the rota in advance, and opens the door and duty manager screens without a shift
  // tonight. The till is the bar manager's (0044, 0046, E-101 criterion 2).
  FOH_MANAGER: ['night.door', 'night.manage', 'rota.read', 'rota.write'],
  FRONT_OF_HOUSE: [],
  // Owns the bar's catalogue and its stock, and opens the till without a bar shift. Nothing in
  // the old estate grants this role, so the import cannot reach it (0044, F-101 criterion 1).
  BAR_MANAGER: ['bar.read', 'bar.write', 'night.till'],
  // Verifies access profile declarations and nothing else: sighting evidence and agreeing the
  // door's wording is the whole of the job (D-127 criterion 2).
  ACCESSIBILITY_OFFICER: ['access.verify'],
  COMMITTEE: [],
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
