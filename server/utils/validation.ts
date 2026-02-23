import { z } from 'zod/v4'

/**
 * Reusable Zod password schema with standard strength requirements.
 *
 * Rules:
 * - Minimum 8 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one digit
 */
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
  .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
  .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' })
