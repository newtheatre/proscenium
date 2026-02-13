import { z } from 'zod'
import { required } from './common'

/**
 * Venue-related validation schemas
 */

/**
 * Venue creation validation schema
 */
export const venueCreateSchema = z.object({
  name: required('Venue name').max(100, 'Venue name too long'),
  address: z.string().max(500, 'Address too long').optional(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').optional(),
  imageUrl: z.string().url('Invalid image URL').or(z.literal('')).optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  featureIds: z.array(z.string()).optional(),
})

/**
 * Venue update validation schema
 */
export const venueUpdateSchema = z.object({
  name: required('Venue name').max(100, 'Venue name too long').optional(),
  address: z.string().max(500, 'Address too long').optional(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').nullable().optional(),
  imageUrl: z.string().url('Invalid image URL').or(z.literal('')).optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  isActive: z.boolean().optional(),
  featureIds: z.array(z.string()).optional(),
})

/**
 * Venue creation form validation schema (matches frontend form structure)
 */
export const venueCreateFormSchema = z.object({
  name: required('Venue name').max(100, 'Venue name too long'),
  address: z.string().max(500, 'Address too long'),
  capacity: z.string(), // String in form, converted to number in handler
  imageUrl: z.string().url('Invalid image URL').or(z.literal('')),
  notes: z.string().max(1000, 'Notes too long'),
  isActive: z.boolean(),
})

/**
 * Venue update form validation schema (matches frontend form structure)
 */
export const venueUpdateFormSchema = z.object({
  name: required('Venue name').max(100, 'Venue name too long'),
  address: z.string().max(500, 'Address too long'),
  capacity: z.string(), // String in form, converted to number in handler
  imageUrl: z.string().url('Invalid image URL').or(z.literal('')),
  notes: z.string().max(1000, 'Notes too long'),
  isActive: z.boolean(),
  featureIds: z.array(z.string()),
})

/**
 * Venue feature creation validation schema
 */
export const venueFeatureCreateSchema = z.object({
  name: required('Feature name').max(100, 'Feature name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().max(50, 'Icon string too long').optional(),
  isActive: z.boolean().optional(),
})

/**
 * Venue feature update validation schema
 */
export const venueFeatureUpdateSchema = z.object({
  name: required('Feature name').max(100, 'Feature name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().max(50, 'Icon string too long').optional(),
  isActive: z.boolean().optional(),
})

/**
 * Venue feature creation form validation schema (matches frontend form structure)
 */
export const venueFeatureCreateFormSchema = z.object({
  name: required('Feature name').max(100, 'Feature name too long'),
  description: z.string().max(500, 'Description too long'),
  icon: z.string().max(50, 'Icon string too long'),
  isActive: z.boolean(),
})

/**
 * Venue feature update form validation schema (matches frontend form structure)
 */
export const venueFeatureUpdateFormSchema = z.object({
  name: required('Feature name').max(100, 'Feature name too long'),
  description: z.string().max(500, 'Description too long'),
  icon: z.string().max(50, 'Icon string too long'),
  isActive: z.boolean(),
})