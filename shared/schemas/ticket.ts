import { z } from 'zod'
import { required } from './common'

/**
 * Ticket-related validation schemas
 */

/**
 * TicketType creation validation schema
 */
export const ticketTypeCreateSchema = z.object({
  name: required('Ticket type name').max(100, 'Ticket type name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  defaultPrice: z.number().min(0, 'Price must be non-negative'),
  sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().nullable(),
})

/**
 * TicketType update validation schema
 */
export const ticketTypeUpdateSchema = z.object({
  name: required('Ticket type name').max(100, 'Ticket type name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  defaultPrice: z.number().min(0, 'Price must be non-negative').optional(),
  sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().nullable(),
  isActive: z.boolean().optional(),
})

/**
 * ShowTicketPrice creation validation schema
 */
export const showTicketPriceCreateSchema = z.object({
  price: z.number().min(0, 'Price must be non-negative'),
  notes: z.string().max(500, 'Notes too long').optional(),
  showId: required('Show ID'),
  ticketTypeId: required('Ticket type ID'),
})

/**
 * ShowTicketPrice update validation schema
 */
export const showTicketPriceUpdateSchema = z.object({
  price: z.number().min(0, 'Price must be non-negative').optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  isActive: z.boolean().optional(),
})

/**
 * PerformanceTicketPrice creation validation schema
 */
export const performanceTicketPriceCreateSchema = z.object({
  price: z.number().min(0, 'Price must be non-negative'),
  notes: z.string().max(500, 'Notes too long').optional(),
  performanceId: required('Performance ID'),
  ticketTypeId: required('Ticket type ID'),
})

/**
 * PerformanceTicketPrice update validation schema
 */
export const performanceTicketPriceUpdateSchema = z.object({
  price: z.number().min(0, 'Price must be non-negative').optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  isActive: z.boolean().optional(),
})

/**
 * ReservedTicket creation validation schema (for use in reservation creation)
 */
export const reservedTicketCreateSchema = z.object({
  ticketTypeId: required('Ticket type ID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  pricePerItemAtReservation: z.number().min(0, 'Price must be non-negative'),
  ticketTypeNameAtReservation: required('Ticket type name'),
  performanceTicketPriceId: z.string().optional(),
  showTicketPriceId: z.string().optional(),
})

/**
 * ReservedTicket update validation schema
 */
export const reservedTicketUpdateSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1').optional(),
  pricePerItemAtReservation: z.number().min(0, 'Price must be non-negative').optional(),
})

/**
 * TicketType form validation schema (for admin forms)
 */
export const ticketTypeFormSchema = z.object({
  name: required('Ticket type name').max(100, 'Ticket type name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  defaultPrice: z.string(), // String in form, converted to number in handler
  sortOrder: z.string().optional(), // String in form, converted to number in handler
  isActive: z.boolean(),
})

/**
 * Show ticket price form validation schema
 */
export const showTicketPriceFormSchema = z.object({
  price: z.string(), // String in form, converted to number in handler
  notes: z.string().max(500, 'Notes too long'),
  ticketTypeId: required('Ticket type ID'),
  isActive: z.boolean(),
})

/**
 * Performance ticket price form validation schema
 */
export const performanceTicketPriceFormSchema = z.object({
  price: z.string(), // String in form, converted to number in handler
  notes: z.string().max(500, 'Notes too long'),
  ticketTypeId: required('Ticket type ID'),
  isActive: z.boolean(),
})