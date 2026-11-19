// The tickets the signed-in buyer already has that passes bought now could cover (Matt, 19 November),
// for the offer beside swapping a ticket for a pass on Choose tickets: each is ticked to begin with.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { coverChoicesOnBuying } from '../../../../../pass-covers'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ passTypeId: idSchema('pty'), passPriceId: idSchema('ppr'), count: z.coerce.number().int().min(1).max(20) }), // not-policy: as many passes as one booking buys
}, async (event, { input, actor }) => coverChoicesOnBuying(getRouterParam(event, 'id')!, input.passTypeId, input.passPriceId, input.count, actor.accountId!))
