// Opening a reported incident as a reviewer moves it to in review (FH-29).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { openForReview } from '../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.manage',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await openForReview(unit.view(), record!.id!, actor.accountId!)
  return { opened: true }
})
