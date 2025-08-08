import type { User, RoleType } from '@prisma/client'

/**
 * Check if user has required role
 */
export function hasRole(user: User & { roles: { role: RoleType }[] }, requiredRole: RoleType): boolean {
  return user.roles.some(userRole => userRole.role === requiredRole)
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(user: User & { roles: { role: RoleType }[] }, requiredRoles: RoleType[]): boolean {
  return user.roles.some(userRole => requiredRoles.includes(userRole.role))
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): { valid: boolean, message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' }
  }
  if (!/(?=.*[a-z])/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' }
  }
  if (!/(?=.*[A-Z])/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' }
  }
  if (!/(?=.*\d)/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' }
  }
  return { valid: true }
}
