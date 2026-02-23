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

/** Check whether a user holds a specific role. */
export function hasRole(user: AbilityUser, role: string): boolean {
  return user.roles?.includes(role) || false
}

/** Shorthand: user is ADMIN or MANAGER. */
export function isAdminOrManager(user: AbilityUser): boolean {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
}

/** Shorthand: user is ADMIN, MANAGER, or BOX_OFFICE. */
export function isStaff(user: AbilityUser): boolean {
  return isAdminOrManager(user) || hasRole(user, 'BOX_OFFICE')
}
