// Adds a shift not tied to a performance: a get-in, a social, a bar opening (FH-08). It confers
// rostered only.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { addOccasionShift } from '../../../rota'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    title: z.string().trim().min(1).max(80), // not-policy: shape bound, as the table's CHECK
    venueId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
    dutyId: z.string().min(1).max(40), // not-policy: shape bound
    places: z.number().int().min(1).max(50), // not-policy: shape bound, as the table's CHECK
    callAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    briefing: z.string().trim().max(1000).nullish(), // not-policy: shape bound, as the table's CHECK
    signUp: z.boolean().optional(),
    crewCallId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  }).strict(),
}, async (_event, { input, unit }) => ({ shiftId: await addOccasionShift(unit.view(), input) }))
