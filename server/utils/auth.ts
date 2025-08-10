import type { User, RoleType } from '@prisma/client'
import { randomBytes } from 'crypto'

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

/**
 * Generate a secure verification token
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Send verification email
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  // TODO: Implement an email service
  console.log(`Email verification for ${email} with token: ${token}`)
  console.log(`Verification URL: ${process.env.NUXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/verify-email?token=${token}`)

  // For now, just log to console. Replace with actual email sending logic
  // Example with Resend:
  // await resend.emails.send({
  //   from: 'noreply@newtheatre.org.uk',
  //   to: email,
  //   subject: 'Verify your email address',
  //   html: `<a href="${process.env.NUXT_PUBLIC_BASE_URL}/verify-email?token=${token}">Click here to verify your email</a>`
  // })
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // TODO: Implement an email service
  console.log(`Password reset for ${email} with token: ${token}`)
  console.log(`Reset URL: ${process.env.NUXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`)

  // For now, just log to console. Replace with actual email sending logic
  // Example with Resend:
  // await resend.emails.send({
  //   from: 'noreply@newtheatre.org.uk',
  //   to: email,
  //   subject: 'Reset your password',
  //   html: `<a href="${process.env.NUXT_PUBLIC_BASE_URL}/reset-password?token=${token}">Click here to reset your password</a>`
  // })
}
