/**
 * The NNT session contract — copied from stage-door `packages/auth-types`
 * v1.0 (docs/session-contract.md in that repo). DO NOT EDIT HERE: change it
 * there and re-copy. This app reads the session; only the auth service at
 * auth.newtheatre.org.uk writes it.
 */

declare module '#auth-utils' {
  interface User {
    /** Canonical user id — stable forever, our bookings FK against it. */
    id: string
    /** Lowercased. */
    email: string
    name: string
    /** Email verified; always true for Google sign-ins. */
    verified: boolean
    /** True = shadow account (no password ever set, no Google link). */
    guest: boolean
    /** Scoped role strings: 'proscenium:ADMIN', 'rooms:ADMIN', 'auth:ADMIN', … */
    roles: string[]
  }

  interface UserSession {
    /** Epoch ms of the original login. */
    loggedInAt: number
    /** Epoch ms of the last DB re-read — drives staleness checks. */
    refreshedAt: number
    /** Copy of users.session_epoch at seal time — drives force-logout. */
    epoch: number
  }
}

/** Minimal user shape the helpers need (structurally matches the session user). */
export interface RoleHolder {
  roles: string[]
}

/** Minimal session shape the staleness helper needs. */
export interface StaleCheckable {
  refreshedAt: number
}

/** How old a session's refreshedAt may be before privileged middleware must refresh it. */
export const ROLE_STALENESS_MS = 15 * 60_000

/** True if the user holds `app:role` (e.g. hasRole(user, 'rooms', 'ADMIN')). */
export function hasRole(user: RoleHolder | null | undefined, app: string, role: string): boolean {
  return user?.roles?.includes(`${app}:${role}`) ?? false
}

/** True if the user holds any of the given roles in the app's namespace. */
export function hasAnyRole(user: RoleHolder | null | undefined, app: string, ...roles: string[]): boolean {
  return roles.some(role => hasRole(user, app, role))
}

/**
 * True if the session's roles are too stale to honour on a privileged route.
 * Negative ages (clock skew) count as stale — defensive per the contract.
 */
export function isStale(session: StaleCheckable | null | undefined, maxAgeMs: number = ROLE_STALENESS_MS): boolean {
  if (!session || typeof session.refreshedAt !== 'number') return true
  const age = Date.now() - session.refreshedAt
  return age < 0 || age > maxAgeMs
}
