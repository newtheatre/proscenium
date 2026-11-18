// The shapes box office routes accept that a screen also checks, so the form and the route say the
// same thing for the same value. Nothing here imports server code: a page imports this file.
import { z } from 'zod'

/** Asking for complimentary tickets (BO-62). */
export const compsInput = z.object({
  performanceId: z.string().min(1).max(64), // not-policy: shape bound
  bandId: z.string().max(64).optional(), // not-policy: shape bound; left out or empty, the seats with most room are taken
  quantity: z.number().int().min(1).max(50), // not-policy: shape bound; the setting is the limit
  email: z.string().trim().email().max(254), // not-policy: the longest address there is
  name: z.string().trim().max(120).optional(), // not-policy: shape bound
  reasonTermId: z.string().min(1).max(64), // not-policy: shape bound
}).strict()

/** A seating layout of a space (layouts.ts): its seats, wheelchair spaces and the seats each space takes the place of. */
export const layoutInput = z.object({
  spaceId: z.string().min(3).max(40), // not-policy: an id's length
  name: z.string().trim().min(1).max(80), // not-policy: the table's own bound on a name
  seats: z.number().int().min(0).max(100_000).nullable(), // not-policy: a sanity bound, larger than any house
  wheelchairSpaces: z.number().int().min(0).max(500), // not-policy: a sanity bound
  seatsPerSpace: z.number().int().min(0).max(20), // not-policy: a sanity bound on seats taken out for one space
}).strict()
