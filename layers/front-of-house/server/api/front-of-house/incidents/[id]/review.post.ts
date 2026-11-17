// Sets the category and severity, or adds a comment, logging each change (FH-29).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { SEVERITIES } from '../../../../db/schema'
import { reviewIncident } from '../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    categoryId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
    severity: z.enum(SEVERITIES).optional(),
    whereNote: z.string().trim().max(120).nullish(), // not-policy: shape bound, as the table's CHECK
    comment: z.string().trim().max(2000).nullish(), // not-policy: shape bound, as the table's CHECK
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await reviewIncident(unit.view(), record!.id!, { ...input, by: actor.accountId! })
  return { reviewed: true }
})
