// CO-23, rules D1, D2 and D4: adds a call; something else in the space only warns.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addCall, callInput } from '../../../../calls'
import { requireEngagement } from '../../../../engagements'

export default defineRoute({
  ability: 'companies.engagement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: callInput,
}, async (_event, { input, actor, record, unit }) => addCall({ unit, actor, engagement: await requireEngagement(record!.id) }, input))
