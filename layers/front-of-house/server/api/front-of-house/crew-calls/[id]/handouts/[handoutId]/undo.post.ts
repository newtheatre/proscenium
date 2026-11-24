// Undoes a handout with a reversing row (HO1).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { undoHandout } from '../../../../../../perks'

export default defineRoute({
  ability: 'front-of-house.handout.record',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, record, unit }) => {
  await undoHandout(unit.view(), { callId: record!.id!, handoutId: getRouterParam(event, 'handoutId')!, by: actor.accountId! })
  return { ok: true }
})
