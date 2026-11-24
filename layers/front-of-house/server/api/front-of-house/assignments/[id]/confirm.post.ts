// Confirms a request to work a shift (FH-11).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { confirmRequest } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.assignment', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await confirmRequest(unit.view(), record!.id!, actor.accountId!)
  return { assignmentId: record!.id }
})
