// Rule A3 (CO-21): an answer given on paper, recorded for a live contact by someone who did not draft the version.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { recordAnswer, recordInput, requireAgreement } from '../../../../agreements'
import { requireEngagement } from '../../../../engagements'

export default defineRoute({
  ability: 'companies.agreement.record',
  record: event => ['companies.agreement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: recordInput,
}, async (_event, { input, actor, record, unit }) => {
  const agreement = await requireAgreement(record!.id)
  await recordAnswer({ unit, actor, engagement: await requireEngagement(agreement.engagementId) }, agreement, input)
  return { answer: input.answer }
})
