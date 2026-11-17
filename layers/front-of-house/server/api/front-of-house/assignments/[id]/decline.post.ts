// Declines a request to work a shift, freeing the place (FH-11).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { declineRequest } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.assignment', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await declineRequest(unit.view(), record!.id!, actor.accountId!)
  return { assignmentId: record!.id }
})
