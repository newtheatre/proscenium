// Adds one shift to a performance, as a draft, with its window worked out (FH-01).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { addShift } from '../../../../../shifts'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    dutyId: z.string().min(1).max(40), // not-policy: shape bound
    places: z.number().int().min(1).max(50), // not-policy: shape bound, as the table's CHECK
    callAt: z.number().int().positive().optional(),
    endsAt: z.number().int().positive().optional(),
    briefing: z.string().trim().max(1000).nullish(), // not-policy: shape bound, as the table's CHECK
    signUp: z.boolean().optional(),
  }).strict(),
}, async (_event, { input, record, unit }) => ({ shiftId: await addShift(unit.view(), record!.id!, input) }))
