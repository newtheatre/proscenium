import { z } from 'zod'
import { required } from './common'

/**
 * Performance-related validation schemas
 */

/**
 * Performance type enum validation
 */
export const performanceTypeSchema = z.enum([
  'PERFORMANCE',
  'RELAXED_PERFORMANCE',
  'SIGNED_PERFORMANCE',
  'AUDIO_DESCRIBED_PERFORMANCE',
  'CAPTIONED_PERFORMANCE',
  'DRESS_REHEARSAL',
  'TECHNICAL_RUN',
  'PREVIEW',
  'EVENT',
  'WORKSHOP',
])

/**
 * Performance booking status enum validation
 */
export const performanceBookingStatusSchema = z.enum([
  'SCHEDULED',
  'ON_SALE',
  'RESTRICTED',
  'CLOSED',
  'SOLD_OUT',
  'CANCELLED',
  'PAST',
])

/**
 * Performance creation validation schema
 */
export const performanceCreateSchema = z.object({
  title: required('Performance title').max(200, 'Performance title too long'),
  startDateTime: z.string().datetime('Invalid start date time'),
  endDateTime: z.string().datetime('Invalid end date time'),
  type: performanceTypeSchema,
  details: z.string().max(2000, 'Details too long').optional(),
  status: performanceBookingStatusSchema.default('SCHEDULED'),
  maxCapacity: z.number().int().min(-1, 'Max capacity must be -1 (unlimited) or positive'),
  reservationsOpen: z.boolean().default(true),
  reservationInstructions: z.string().max(1000, 'Reservation instructions too long').optional(),
  externalBookingLink: z.string().url('Invalid external booking URL').or(z.literal('')).optional(),
  showId: z.string().optional(),
  venueId: z.string().optional(),
}).refine((data) => {
  const start = new Date(data.startDateTime)
  const end = new Date(data.endDateTime)
  return start < end
}, {
  message: 'End date time must be after start date time',
  path: ['endDateTime'],
})

/**
 * Performance update validation schema
 */
export const performanceUpdateSchema = z.object({
  title: required('Performance title').max(200, 'Performance title too long').optional(),
  startDateTime: z.string().datetime('Invalid start date time').optional(),
  endDateTime: z.string().datetime('Invalid end date time').optional(),
  type: performanceTypeSchema.optional(),
  details: z.string().max(2000, 'Details too long').optional(),
  status: performanceBookingStatusSchema.optional(),
  maxCapacity: z.number().int().min(-1, 'Max capacity must be -1 (unlimited) or positive').optional(),
  reservationsOpen: z.boolean().optional(),
  reservationInstructions: z.string().max(1000, 'Reservation instructions too long').optional(),
  externalBookingLink: z.string().url('Invalid external booking URL').or(z.literal('')).optional(),
  showId: z.string().optional(),
  venueId: z.string().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => {
  if (data.startDateTime && data.endDateTime) {
    const start = new Date(data.startDateTime)
    const end = new Date(data.endDateTime)
    return start < end
  }
  return true
}, {
  message: 'End date time must be after start date time',
  path: ['endDateTime'],
})

/**
 * Performance form validation schema (for admin forms)
 */
export const performanceFormSchema = z.object({
  title: required('Performance title').max(200, 'Performance title too long'),
  startDateTime: z.string().min(1, 'Start date time is required'),
  endDateTime: z.string().min(1, 'End date time is required'),
  type: performanceTypeSchema,
  details: z.string().max(2000, 'Details too long'),
  status: performanceBookingStatusSchema,
  maxCapacity: z.string(), // String in form, converted to number in handler
  reservationsOpen: z.boolean(),
  reservationInstructions: z.string().max(1000, 'Reservation instructions too long'),
  externalBookingLink: z.string().url('Invalid external booking URL').or(z.literal('')),
  showId: z.string(),
  venueId: z.string(),
  isActive: z.boolean(),
}).refine((data) => {
  if (data.startDateTime && data.endDateTime) {
    const start = new Date(data.startDateTime)
    const end = new Date(data.endDateTime)
    return start < end
  }
  return true
}, {
  message: 'End date time must be after start date time',
  path: ['endDateTime'],
})

/**
 * Performance pricing validation schema (for getting available tickets/prices)
 */
export const performancePricingQuerySchema = z.object({
  performanceId: required('Performance ID'),
})

/**
 * Performance reservation availability schema
 */
export const performanceAvailabilityQuerySchema = z.object({
  performanceId: required('Performance ID'),
  ticketCounts: z.record(z.string(), z.number().int().min(1)).optional(),
})

/**
 * Performance list filter schema
 */
export const performanceFilterSchema = z.object({
  showId: z.string().optional(),
  venueId: z.string().optional(),
  status: performanceBookingStatusSchema.optional(),
  type: performanceTypeSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
  offset: z.number().int().min(0).default(0).optional(),
})