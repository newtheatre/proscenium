import { z } from 'zod'
import { MembershipType, RoleType } from '@prisma/client'
import { emailSchema, passwordSchema, nameSchema } from './common'

/**
 * User-related validation schemas
 */

/**
 * Student ID validation schema
 */
export const studentIdSchema = z.string().max(20, 'Student ID too long').optional()

/**
 * Profile validation schema
 */
export const profileSchema = z.object({
  name: nameSchema.optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z.string().url('Invalid avatar URL').or(z.literal('')).optional(),
  gradYear: z.number().int().min(1900).max(2100).optional().nullable(),
  course: z.string().max(100, 'Course name too long').optional(),
})

/**
 * Social links validation schema
 */
export const socialLinksSchema = z.object({
  github: z.string().url('Invalid GitHub URL').or(z.literal('')).optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').or(z.literal('')).optional(),
  facebook: z.string().url('Invalid Facebook URL').or(z.literal('')).optional(),
  discord: z.string().max(50, 'Discord handle too long').optional(),
  instagram: z.string().max(50, 'Instagram handle too long').optional(),
})

/**
 * Membership validation schema
 */
export const membershipSchema = z.object({
  type: z.nativeEnum(MembershipType),
  expiry: z.string().datetime().nullable().optional(),
})

/**
 * User roles validation schema
 */
export const rolesSchema = z.array(z.nativeEnum(RoleType))

/**
 * Login request validation schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

/**
 * Registration request validation schema
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
})

/**
 * Password reset initiation schema
 */
export const passwordResetInitiateSchema = z.object({
  email: emailSchema,
})

/**
 * Password reset completion schema
 */
export const passwordResetCompleteSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
})

/**
 * Password update schema
 */
export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
})

/**
 * Email verification schema
 */
export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
})

/**
 * User profile setup schema (for initial account setup)
 */
export const userSetupSchema = z.object({
  name: nameSchema,
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  gradYear: z.number().int().min(1900).max(2100).optional(),
  course: z.string().max(100, 'Course name too long').optional(),
  membershipType: z.nativeEnum(MembershipType),
  socialLinks: socialLinksSchema.optional(),
  studentId: studentIdSchema,
})

/**
 * User profile update schema (for regular updates after setup)
 */
export const userUpdateSchema = z.object({
  name: nameSchema.optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  gradYear: z.number().int().min(1900).max(2100).optional(),
  course: z.string().max(100, 'Course name too long').optional(),
  membershipType: z.nativeEnum(MembershipType).optional(),
  socialLinks: socialLinksSchema.optional(),
  studentId: studentIdSchema,
  email: emailSchema.optional(),
  newPassword: passwordSchema.optional(),
})

/**
 * Admin user update schema (for admin operations)
 */
export const adminUserUpdateSchema = z.object({
  email: emailSchema.optional(),
  studentId: studentIdSchema,
  password: passwordSchema.optional(),
  emailVerified: z.boolean().optional(),
  setupCompleted: z.boolean().optional(),
  isActive: z.boolean().optional(),
  roles: rolesSchema.optional(),
  membership: membershipSchema.optional(),
  profile: profileSchema.extend({
    socialLinks: socialLinksSchema.optional(),
  }).optional(),
})
