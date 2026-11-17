// Closes an incident with a note; a serious one needs someone other than its reporter (FH-30).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { closeIncident } from '../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ note: z.string().trim().min(1).max(2000) }).strict(), // not-policy: shape bound, as the table's CHECK
}, async (_event, { input, record, actor, unit }) => {
  await closeIncident(unit.view(), record!.id!, { note: input.note, by: actor.accountId! })
  return { closed: true }
})
