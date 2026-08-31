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
  'COMMITTEE',
] as const

export type Role = (typeof ROLES)[number]

// Standing permissions are administrative only. Operational authority (the door, the till, a
// register) derives from tonight's facts and is never granted in advance (0009).
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
  'rooms.read',
  'rooms.write',
] as const

export type Permission = (typeof PERMISSIONS)[number]

// Deliberately sparse: a role earns a permission when the thing it unlocks exists. Guessing
// now would grant authority over features nobody has reviewed.
export const PERMISSION_MAP: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: ['accounts.read', 'audit.read', 'audit.write', 'config.read', 'fellowships.read', 'fellowships.write', 'members.read', 'members.write', 'rooms.read', 'rooms.write'],
  // J-103's story is the Theatre Manager's: they are who searches the trail and records what
  // happened outside the system.
  THEATRE_MANAGER: ['accounts.read', 'audit.read', 'audit.write', 'config.read', 'fellowships.read', 'members.read', 'rooms.read', 'rooms.write'],
  TRAINING_MANAGER: ['accounts.read', 'members.read', 'rooms.read'],
  BOX_OFFICE: [],
  FOH_MANAGER: [],
  FRONT_OF_HOUSE: [],
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
