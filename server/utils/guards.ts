import type { RoleType } from '@prisma/client'
import type { H3Event } from 'h3'

/**
 * Guard to protect API routes that require authentication
 */
export async function requireAuth(event: H3Event) {
  const session = await getUserSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
  }

  return session.user
}

/**
 * Guard to protect API routes that require specific roles
 */
export async function requireRole(event: H3Event, requiredRoles: RoleType | RoleType[]) {
  const user = await requireAuth(event)
  const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]

  const hasRequiredRole = user.roles.some(userRole => rolesArray.includes(userRole as RoleType))

  if (!hasRequiredRole) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Insufficient permissions',
    })
  }

  return user
}

/**
 * Guard to ensure user can only access their own data or has admin role
 */
export async function requireOwnershipOrAdmin(event: H3Event, resourceUserId: string) {
  const user = await requireAuth(event)

  const isOwner = user.id === resourceUserId
  const isAdmin = user.roles.includes('ADMIN')

  if (!isOwner && !isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied',
    })
  }

  return user
}
