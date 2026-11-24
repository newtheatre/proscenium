// Rule A2 (CO-18): sends a draft to the contacts set to receive agreements; an enquiry becomes offered.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireAgreement, sendAgreement } from '../../../../../../agreements'
import { requireEngagement } from '../../../../../../engagements'

export default defineRoute({
  ability: 'companies.agreement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, record, unit }) => {
  const engagement = await requireEngagement(record!.id)
  await sendAgreement(unit, actor, engagement, await requireAgreement(getRouterParam(event, 'agreement') ?? '', engagement.id))
  return { done: true }
})
