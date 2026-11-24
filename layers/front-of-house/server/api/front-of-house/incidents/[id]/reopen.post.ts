// A manager reopens a closed incident; the reopening is logged (FH-30).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reopenIncident } from '../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ reason: z.string().trim().min(1).max(2000) }).strict(), // not-policy: shape bound, as the table's CHECK
}, async (_event, { input, record, actor, unit }) => {
  await reopenIncident(unit.view(), record!.id!, { reason: input.reason, by: actor.accountId! })
  return { reopened: true }
})
