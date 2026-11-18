// One booking of a file brought in from another system (server/importing.ts): what the route takes
// and what a job carries.
import { z } from 'zod'

const MOST_TICKETS = 60 // not-policy: a guard against a malformed row, not a selling limit

export const bookingSchema = z.object({
  /** The booking's reference in the other system, kept as it is. */
  reference: z.string().trim().min(4).max(16).regex(/^[A-Za-z0-9-]+$/),
  /** What the buyer's code says when scanned, such as the address in a QR code. */
  code: z.string().trim().min(6).max(512).optional(),
  email: z.string().trim().min(3).max(254),
  name: z.string().trim().max(120).nullish(),
  /** The production's slug here, and when the performance starts. */
  production: z.string().trim().min(1).max(200),
  startsAt: z.number().int().positive(),
  /** When the booking was made, so lists show it in its place. */
  createdAt: z.number().int().positive().optional(),
  /** The other system no longer holds it: one imported earlier is released, and one not yet here is left out. */
  cancelled: z.boolean().default(false),
  tickets: z.array(z.object({
    /** A ticket type's name here. */
    type: z.string().trim().min(1).max(80),
    amountMinor: z.number().int().min(0),
    /** A part of the house by name, where the performance has more than one. */
    band: z.string().trim().max(80).optional(),
  })).min(1).max(MOST_TICKETS),
})
export type ImportBooking = z.infer<typeof bookingSchema>
