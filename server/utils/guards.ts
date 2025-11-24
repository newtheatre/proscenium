/**
 * Authentication Utilities
 *
 * Provides helper functions for user authentication, authorization,
 * and session management.
 *
 * @module server/utils/auth
 */

import type { H3Event } from 'h3'
import type { User } from '#auth-utils'
import type { RoleType } from '~~/prisma/generated/client'

/**
 * Requires user to be authenticated
 *
 * Throws 401 error if user is not authenticated.
 *
 * @param event - H3 event object
 * @returns User session data
 * @throws 401 Unauthorized if user is not authenticated
 *
 * @example
 * ```ts
 * const user = await requireAuth(event)
 * // user is guaranteed to be authenticated here
 * ```
 */
export async function requireAuth(event: H3Event): Promise<User> {
  const { user } = await getUserSession(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'You must be logged in to access this resource',
    })
  }

  return user
}

/**
 * Requires user to have admin role
 *
 * Throws 401 if not authenticated, 403 if not admin.
 *
 * @param event - H3 event object
 * @returns User session data for admin user
 * @throws 401 Unauthorized if user is not authenticated
 * @throws 403 Forbidden if user is not an admin
 *
 * @example
 * ```ts
 * const admin = await requireAdmin(event)
 * // user is guaranteed to be an authenticated admin
 * ```
 */
export async function requireAdmin(event: H3Event): Promise<User> {
  const user = await requireAuth(event)

  if (!user.roles.includes('ADMIN')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'You must be an admin to access this resource',
    })
  }

  return user
}

/**
 * Requires user to have specific roles
 *
 * Throws 401 if not authenticated, 403 if missing required roles.
 *
 * @param event - H3 event object
 * @param roles - Role or array of roles required
 * @param require - 'any' (default) to require at least one role, 'all' to require all roles
 * @returns User session data for user with required roles
 * @throws 401 Unauthorized if user is not authenticated
 * @throws 403 Forbidden if user does not have required roles
 *
 * @example
 * ```ts
 * const manager = await requireRole(event, 'MANAGER')
 * // user is guaranteed to be an authenticated manager
 *
 * const trainer = await requireRole(event, ['ADMIN', 'TRAINER'])
 * // user is guaranteed to be an authenticated admin or trainer
 * ```
 */
export async function requireRole(event: H3Event, roles: RoleType | RoleType[], require: 'any' | 'all' = 'any'): Promise<User> {
  const user = await requireAuth(event)

  const rolesArray = Array.isArray(roles) ? roles : [roles]

  const hasRequiredRole
    = require === 'all'
      ? rolesArray.every(role => user.roles.includes(role))
      : rolesArray.some(role => user.roles.includes(role))

  if (!hasRequiredRole) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Insufficient permissions',
      message: 'You do not have the required permissions to access this resource',
    })
  }

  return user
}

/**
 * Guard to protect FOH routes that require ADMIN or MANAGER access
 */
export async function requireFOHAccess(event: H3Event) {
  return await requireRole(event, ['ADMIN', 'MANAGER'])
}
