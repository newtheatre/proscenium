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
