// Takes someone off a shift. They are told; no reason is asked.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removePerson } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.assignment', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await removePerson(unit.view(), record!.id!, actor.accountId!)
  return { assignmentId: record!.id }
})
