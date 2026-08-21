import { can } from '../permissions'

/**
 * User shape available during authorization checks.
 * Matches the session user provided by nuxt-auth-utils.
 */
export interface AbilityUser {
  id: string
  email: string
  name: string
  verified: boolean
  roles: string[]
}

/** Minimal resource shape for ownership checks. */
export interface OwnedResource {
  id: string
}

/**
 * The three shorthands every ability routes through. They resolve permissions
 * from appManifest.ts, which is the same object served to the auth service.
 */
export function isStaff(user: AbilityUser): boolean {
  return can(user, 'staff.access')
}

export function isAdminOrManager(user: AbilityUser): boolean {
  return can(user, 'programme.manage')
}

/** Destructive deletes, held by ADMIN alone. */
export function isAdmin(user: AbilityUser): boolean {
  return can(user, 'catalogue.delete')
}

/** Reach the show night screen. A confirmed shift narrows it to a night (ADR-0019). */
export function canWorkFoh(user: AbilityUser): boolean {
  return can(user, 'foh.work')
}

/** Run the rota: assign, confirm, reassign. */
export function canManageShifts(user: AbilityUser): boolean {
  return can(user, 'shift.manage')
}

/** Maintain the emergency card and the contact list. */
export function canManageFoh(user: AbilityUser): boolean {
  return can(user, 'foh.manage')
}

/** The bar catalogue, stock, voids and exports. */
export function canManageBar(user: AbilityUser): boolean {
  return can(user, 'bar.manage')
}
