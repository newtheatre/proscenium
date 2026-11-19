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
    /** A ticket type's name here. Left out for a pass's entry. */
    type: z.string().trim().min(1).max(80).optional(),
    /** For a pass's entry in place of a ticket type: the pass's code, one of ours or the other system's as it scans. */
    pass: z.string().trim().min(4).max(512).optional(),
    amountMinor: z.number().int().min(0),
    /** A part of the house by name, where the performance has more than one. */
    band: z.string().trim().max(80).optional(),
  }).refine(t => !!t.type !== !!t.pass, 'A ticket has a type or a pass, not both.').refine(t => !t.pass || t.amountMinor === 0, 'A pass\'s entry costs nothing.')).min(1).max(MOST_TICKETS),
})
export type ImportBooking = z.infer<typeof bookingSchema>

/** A pass brought in from another system, issued before the bookings that use it. */
export const importPassSchema = z.object({
  /** The text of the code its holder already has, as it scans. It then finds the pass here. */
  code: z.string().trim().min(4).max(512),
  /** The pass's name here, and the name of the price it was sold at. */
  passType: z.string().trim().min(1).max(120),
  price: z.string().trim().min(1).max(80),
  email: z.string().trim().min(3).max(254),
  name: z.string().trim().max(120).nullish(),
  paid: z.boolean(),
  /** Given free in the other system, whatever it says was paid: held here at no amount, and settled. */
  gift: z.boolean().optional(),
})
export type ImportPass = z.infer<typeof importPassSchema>
