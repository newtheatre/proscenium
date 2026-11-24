// Rule A6: withdraws a version that has not been answered; an offer goes back to enquiry.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireAgreement, withdrawAgreement } from '../../../../../../agreements'
import { requireEngagement } from '../../../../../../engagements'

export default defineRoute({
  ability: 'companies.agreement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, record, unit }) => {
  const engagement = await requireEngagement(record!.id)
  withdrawAgreement(unit, actor, engagement, await requireAgreement(getRouterParam(event, 'agreement') ?? '', engagement.id))
  return { done: true }
})
