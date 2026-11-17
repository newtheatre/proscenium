// Open shifts for the member asking, with why they cannot take one (FH-09).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { openShifts } from '../../lists'

export default defineRoute({
  ability: 'front-of-house.shift.sign-up',
  rateLimit: 'default',
  input: z.object({
    productionId: z.string().min(1).max(40).optional(), // not-policy: shape bound
    dutyId: z.string().min(1).max(40).optional(), // not-policy: shape bound
    from: z.coerce.number().int().positive().optional(),
    to: z.coerce.number().int().positive().optional(),
  }).strict(),
}, async (_event, { input, actor }) => ({ shifts: await openShifts(actor.accountId!, input) }))
