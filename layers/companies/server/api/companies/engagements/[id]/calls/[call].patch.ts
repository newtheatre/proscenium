// CO-23, rules D1, D2 and D4: changes a call.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { callInput, changeCall } from '../../../../../calls'
import { requireEngagement } from '../../../../../engagements'

export default defineRoute({
  ability: 'companies.engagement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: callInput,
}, async (event, { input, actor, record, unit }) =>
  changeCall({ unit, actor, engagement: await requireEngagement(record!.id) }, getRouterParam(event, 'call') ?? '', input))
