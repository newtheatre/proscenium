// CO-12, rules E6 and G3: links a production to the engagement; the production takes the company's public name.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { linkInput, linkProduction, requireEngagement } from '../../../../engagements'

export default defineRoute({
  ability: 'companies.engagement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: linkInput,
}, async (_event, { input, actor, record, unit }) => {
  await linkProduction(unit, actor, await requireEngagement(record!.id), input.productionId)
  return { linked: true }
})
