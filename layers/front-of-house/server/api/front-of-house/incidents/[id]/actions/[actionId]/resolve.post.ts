// Marks an action done, or drops it with a reason (FH-29).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { resolveAction } from '../../../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    state: z.enum(['done', 'dropped']),
    note: z.string().trim().max(300).nullish(), // not-policy: shape bound, as the table's CHECK
  }).strict(),
}, (event, { input, record, unit }) => {
  resolveAction(unit.view(), record!.id!, getRouterParam(event, 'actionId')!, input)
  return { resolved: input.state }
})
