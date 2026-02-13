import { z } from 'zod'

/**
 * Common validation schemas and helpers
 */
export const required = (field: string) => z.string().min(1, `${field} is required`)

export const emailSchema = required('Email').email('Invalid email address')
export const nameSchema = required('Name').max(100, 'Name too long')

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
  .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
  .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' })