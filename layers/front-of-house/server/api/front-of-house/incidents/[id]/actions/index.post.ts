// Adds a follow-up action: something to do about a thing, never about a person (FH-29).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { addAction } from '../../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    what: z.string().trim().min(1).max(300), // not-policy: shape bound, as the table's CHECK
    ownerId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), // not-policy: the shape of a YYYY-MM-DD date
  }).strict(),
}, async (_event, { input, record, unit }) => ({ actionId: await addAction(unit.view(), record!.id!, input) }))
