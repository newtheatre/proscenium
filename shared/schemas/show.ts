import { z } from 'zod'
import { required } from './common'

/**
 * Show-related validation schemas
 */

/**
 * Show status enum validation
 */
export const showStatusSchema = z.enum(['CANCELLED', 'DRAFT', 'PUBLISHED'])

/**
 * Show type enum validation
 */
export const showTypeSchema = z.enum(['IN_HOUSE', 'STUDIO', 'FESTIVAL', 'EXTERNAL_HIRE', 'WORKSHOP', 'OTHER'])

/**
 * Show creation validation schema
 */
export const showCreateSchema = z.object({
  title: required('Show title').max(200, 'Show title too long'),
  slug: required('Show slug').max(100, 'Show slug too long').regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: required('Show description').max(2000, 'Description too long'),
  showType: showTypeSchema,
  posterImageUrl: z.string().url('Invalid poster image URL').or(z.literal('')).optional(),
  programmeUrl: z.string().url('Invalid programme URL').or(z.literal('')).optional(),
  ageRating: z.string().max(10, 'Age rating too long').optional(),
})

/**
 * Show update validation schema
 */
export const showUpdateSchema = z.object({
  title: required('Show title').max(200, 'Show title too long').optional(),
  slug: required('Show slug').max(100, 'Show slug too long').regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens').optional(),
  description: required('Show description').max(2000, 'Description too long').optional(),
  status: showStatusSchema.optional(),
  showType: showTypeSchema.optional(),
  posterImageUrl: z.string().url('Invalid poster image URL').or(z.literal('')).optional(),
  programmeUrl: z.string().url('Invalid programme URL').or(z.literal('')).optional(),
  ageRating: z.string().max(10, 'Age rating too long').optional(),
  isActive: z.boolean().optional(),
})

/**
 * ContentWarning creation validation schema
 */
export const contentWarningCreateSchema = z.object({
  name: required('Content warning name').max(100, 'Content warning name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().max(50, 'Icon too long').optional(),
})

/**
 * ContentWarning update validation schema
 */
export const contentWarningUpdateSchema = z.object({
  name: required('Content warning name').max(100, 'Content warning name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().max(50, 'Icon too long').optional(),
  isActive: z.boolean().optional(),
})

/**
 * ShowContentWarning creation validation schema
 */
export const showContentWarningCreateSchema = z.object({
  showId: required('Show ID'),
  contentWarningId: required('Content warning ID'),
  notes: z.string().max(500, 'Notes too long').optional(),
})

/**
 * ShowContentWarning update validation schema
 */
export const showContentWarningUpdateSchema = z.object({
  notes: z.string().max(500, 'Notes too long').optional(),
})

/**
 * ShowInduction creation validation schema
 */
export const showInductionCreateSchema = z.object({
  showId: required('Show ID'),
  technicalRequirements: z.string().max(2000, 'Technical requirements too long').optional(),
  riskAssessmentCompleted: z.boolean().default(false),
  riskAssessmentLink: z.string().url('Invalid risk assessment URL').or(z.literal('')).optional(),
  companyContactName: z.string().max(100, 'Company contact name too long').optional(),
  companyContactEmail: z.string().email('Invalid email address').optional(),
  companyContactPhone: z.string().max(20, 'Phone number too long').optional(),
  inductionNotes: z.string().max(2000, 'Induction notes too long').optional(),
  inductionCompleted: z.boolean().default(false),
})

/**
 * ShowInduction update validation schema
 */
export const showInductionUpdateSchema = z.object({
  technicalRequirements: z.string().max(2000, 'Technical requirements too long').optional(),
  riskAssessmentCompleted: z.boolean().optional(),
  riskAssessmentLink: z.string().url('Invalid risk assessment URL').or(z.literal('')).optional(),
  companyContactName: z.string().max(100, 'Company contact name too long').optional(),
  companyContactEmail: z.string().email('Invalid email address').optional(),
  companyContactPhone: z.string().max(20, 'Phone number too long').optional(),
  inductionNotes: z.string().max(2000, 'Induction notes too long').optional(),
  inductionCompleted: z.boolean().optional(),
})

/**
 * Show form validation schema (for admin forms)
 */
export const showFormSchema = z.object({
  title: required('Show title').max(200, 'Show title too long'),
  slug: required('Show slug').max(100, 'Show slug too long').regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: required('Show description').max(2000, 'Description too long'),
  showType: showTypeSchema,
  posterImageUrl: z.string().url('Invalid poster image URL').or(z.literal('')),
  programmeUrl: z.string().url('Invalid programme URL').or(z.literal('')),
  ageRating: z.string().max(10, 'Age rating too long'),
  status: showStatusSchema.optional(),
  isActive: z.boolean(),
})

/**
 * Show publish validation schema
 */
export const showPublishSchema = z.object({
  status: z.literal('PUBLISHED'),
})

/**
 * ContentWarning form validation schema
 */
export const contentWarningFormSchema = z.object({
  name: required('Content warning name').max(100, 'Content warning name too long'),
  description: z.string().max(500, 'Description too long'),
  icon: z.string().max(50, 'Icon too long'),
  isActive: z.boolean(),
})

/**
 * ShowInduction form validation schema
 */
export const showInductionFormSchema = z.object({
  technicalRequirements: z.string().max(2000, 'Technical requirements too long'),
  riskAssessmentCompleted: z.boolean(),
  riskAssessmentLink: z.string().url('Invalid risk assessment URL').or(z.literal('')),
  companyContactName: z.string().max(100, 'Company contact name too long'),
  companyContactEmail: z.string().email('Invalid email address'),
  companyContactPhone: z.string().max(20, 'Phone number too long'),
  inductionNotes: z.string().max(2000, 'Induction notes too long'),
  inductionCompleted: z.boolean(),
})