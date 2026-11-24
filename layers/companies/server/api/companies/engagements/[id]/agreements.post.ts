// Rule A1 (CO-18, CO-22): new terms for the engagement, as the next version, in draft.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { draftAgreement, termsInput } from '../../../../agreements'
import { requireEngagement } from '../../../../engagements'

export default defineRoute({
  ability: 'companies.agreement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: termsInput,
}, async (_event, { input, actor, record, unit }) => ({ agreementId: await draftAgreement(unit, actor, await requireEngagement(record!.id), input) }))
