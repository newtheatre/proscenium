// A manager marks someone worked or a no-show after the night, or corrects their minutes (FH-34).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setOutcome } from '../../../../reports'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.assignment', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ state: z.enum(['worked', 'no_show']), minutes: z.number().int().min(0).max(1440).nullish() }).strict(), // not-policy: shape bound, at most a day
}, async (_event, { input, record, actor, unit }) => {
  await setOutcome(unit.view(), record!.id!, { ...input, by: actor.accountId! })
  return { state: input.state }
})
