import { z } from 'zod'

/**
 * Venue-related validation schemas
 */

/**
 * Venue creation validation schema
 */
export const venueCreateSchema = z.object({
  name: z.string().min(1, 'Venue name is required').max(100, 'Venue name too long'),
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
  name: z.string().min(1, 'Venue name is required').max(100, 'Venue name too long').optional(),
  address: z.string().max(500, 'Address too long').optional(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').nullable().optional(),
  imageUrl: z.string().url('Invalid image URL').or(z.literal('')).optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  isActive: z.boolean().optional(),
  featureIds: z.array(z.string()).optional(),
})

/**
 * Venue feature creation validation schema
 */
export const venueFeatureCreateSchema = z.object({
  name: z.string().min(1, 'Feature name is required').max(100, 'Feature name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().max(50, 'Icon string too long').optional(),
})

/**
 * Venue feature update validation schema
 */
export const venueFeatureUpdateSchema = z.object({
  name: z.string().min(1, 'Feature name is required').max(100, 'Feature name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  icon: z.string().max(50, 'Icon string too long').optional(),
  isActive: z.boolean().optional(),
})
