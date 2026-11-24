// The batches still standing, newest first, so one made by mistake can be removed (FH-48).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listBatches } from '../../../grid'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  rateLimit: 'default',
  input: z.object({ crewCallId: z.string().min(1).max(40).optional() }), // not-policy: shape bound
}, async (_event, { input }) => ({ batches: await listBatches(input) }))
