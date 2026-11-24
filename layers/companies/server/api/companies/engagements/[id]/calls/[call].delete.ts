// CO-23, rule D4: removes a call.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeCall } from '../../../../../calls'
import { requireEngagement } from '../../../../../engagements'

export default defineRoute({
  ability: 'companies.engagement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { actor, record, unit }) => {
  await removeCall({ unit, actor, engagement: await requireEngagement(record!.id) }, getRouterParam(event, 'call') ?? '')
  return { removed: true }
})
