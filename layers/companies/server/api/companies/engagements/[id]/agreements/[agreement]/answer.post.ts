// Rule A3 (CO-19): a live contact, signed in, accepts or declines a sent version once.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { answerAgreement, answerInput, requireAgreement } from '../../../../../../agreements'
import { requireEngagement } from '../../../../../../engagements'

export default defineRoute({
  ability: 'companies.agreement.answer',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: answerInput,
}, async (event, { input, actor, record, unit }) => {
  const engagement = await requireEngagement(record!.id)
  await answerAgreement({ unit, actor, engagement }, await requireAgreement(getRouterParam(event, 'agreement') ?? '', engagement.id), { answer: input.answer, responderId: actor.accountId! })
  return { answer: input.answer }
})
