// Writes a venue's emergency card; ticking "I have reviewed the whole card" marks it reviewed today (FH-26).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { saveCard } from '../../../emergency'

export default defineRoute({
  ability: 'front-of-house.checklist.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ body: z.string().trim().min(1).max(8000), reviewed: z.boolean().default(false) }).strict(), // not-policy: shape bound, as the table's CHECK
}, async (event, { input, actor, unit }) => {
  await saveCard(unit.view(), { venueId: getRouterParam(event, 'venueId')!, body: input.body, reviewed: input.reviewed, by: actor.accountId! })
  return { saved: true }
})
