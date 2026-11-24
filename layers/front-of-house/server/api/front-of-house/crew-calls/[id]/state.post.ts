// Opens, closes, reopens or archives a crew call (part 3, "Crew call lifecycle").
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { moveCrewCall } from '../../../../crew-calls'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ to: z.enum(['open', 'closed', 'archived']) }).strict(),
}, async (_event, { input, record, unit }) => {
  await moveCrewCall(unit.view(), record!.id!, input.to)
  return { ok: true }
})
