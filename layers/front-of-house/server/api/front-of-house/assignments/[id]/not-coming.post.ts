// Someone leading records, on the night, that a person is not coming (NI-4).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { markNotComing } from '../../../../night'

export default defineRoute({
  ability: 'front-of-house.assignment.check-in',
  record: event => ['front-of-house.assignment', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await markNotComing(unit.view(), record!.id!, actor.accountId!)
  return { state: 'no_show' }
})
