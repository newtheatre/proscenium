import { z } from 'zod'
import { required, emailSchema } from './common'
import { reservedTicketCreateSchema, reservedTicketUpdateSchema } from './ticket'

/**
 * Reservation-related validation schemas
 */

/**
 * Reservation status enum validation
 */
export const reservationStatusSchema = z.enum([
  'PENDING_COLLECTION',
  'COLLECTED',
  'PURCHASED_ON_DOOR',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_ADMIN',
  'NO_SHOW',
  'EXPIRED',
])

/**
 * Reservation creation validation schema
 */
export const reservationCreateSchema = z.object({
  performanceId: required('Performance ID'),
  customerName: required('Customer name').max(100, 'Customer name too long'),
  customerEmail: emailSchema,
  customerPhone: z.string().max(20, 'Phone number too long').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  adminNotes: z.string().max(1000, 'Admin notes too long').optional(),
  collectionDeadline: z.string().datetime('Invalid collection deadline').optional(),
  userId: z.string().optional(),
  reservedTickets: z.array(reservedTicketCreateSchema).min(1, 'At least one ticket must be reserved'),
})

/**
 * Reservation update validation schema
 */
export const reservationUpdateSchema = z.object({
  status: reservationStatusSchema.optional(),
  customerName: required('Customer name').max(100, 'Customer name too long').optional(),
  customerEmail: emailSchema.optional(),
  customerPhone: z.string().max(20, 'Phone number too long').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  adminNotes: z.string().max(1000, 'Admin notes too long').optional(),
  collectionDeadline: z.string().datetime('Invalid collection deadline').optional(),
})

/**
 * Reservation collection validation schema
 */
export const reservationCollectSchema = z.object({
  status: z.literal('COLLECTED'),
  adminNotes: z.string().max(1000, 'Admin notes too long').optional(),
})

/**
 * Reservation cancellation validation schema
 */
export const reservationCancelSchema = z.object({
  status: z.enum(['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN']),
  adminNotes: z.string().max(1000, 'Admin notes too long').optional(),
})

/**
 * Reservation validation schema (for public reservation system)
 */
export const reservationValidateSchema = z.object({
  performanceId: required('Performance ID'),
  ticketCounts: z.record(z.string(), z.number().int().min(1)).refine(
    obj => Object.keys(obj).length > 0,
    { message: 'At least one ticket must be selected' },
  ),
})

/**
 * Reservation form validation schema (for admin forms)
 */
export const reservationFormSchema = z.object({
  performanceId: required('Performance ID'),
  customerName: required('Customer name').max(100, 'Customer name too long'),
  customerEmail: emailSchema,
  customerPhone: z.string().max(20, 'Phone number too long'),
  notes: z.string().max(1000, 'Notes too long'),
  adminNotes: z.string().max(1000, 'Admin notes too long'),
  collectionDeadline: z.string(), // String in form, converted to datetime in handler
  userId: z.string(),
})

/**
 * Public reservation form validation schema (for customer-facing forms)
 */
export const publicReservationFormSchema = z.object({
  customerName: required('Customer name').max(100, 'Customer name too long'),
  customerEmail: emailSchema,
  customerPhone: z.string().max(20, 'Phone number too long'),
  notes: z.string().max(1000, 'Notes too long'),
  ticketCounts: z.record(z.string(), z.number().int().min(1)).refine(
    obj => Object.keys(obj).length > 0,
    { message: 'At least one ticket must be selected' },
  ),
})

/**
 * Reservation search/filter validation schema
 */
export const reservationFilterSchema = z.object({
  performanceId: z.string().optional(),
  status: reservationStatusSchema.optional(),
  customerEmail: z.string().email('Invalid email address').optional(),
  customerName: z.string().optional(),
  reservationCode: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
  offset: z.number().int().min(0).default(0).optional(),
})

/**
 * Reservation code validation schema (for lookup by code)
 */
export const reservationCodeSchema = z.object({
  code: required('Reservation code').length(21, 'Invalid reservation code format'), // nanoid default length
})

/**
 * Reserved ticket update in reservation context
 */
export const reservedTicketInReservationUpdateSchema = z.object({
  reservedTickets: z.array(reservedTicketUpdateSchema.extend({
    id: required('Reserved ticket ID'),
  })).optional(),
})