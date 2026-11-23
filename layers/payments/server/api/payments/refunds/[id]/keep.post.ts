// Keeps the payment behind a refund the system asked for, instead of handing it back: the buyer had
// what they paid for anyway, such as being let in at the door. Every refund of that payment is withdrawn.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, first, Refusal } from '#kit'
import { keepPayment } from '../../../../keep'

export default defineRoute({
  ability: 'payments.refund.approve',
  record: event => ['payments.refund', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  const refund = await first<{ intent_id: string }>('SELECT p.intent_id FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE r.id = ?', record!.id)
  if (!refund) throw new Refusal('core.not-found', 'There is no such refund.', { status: 404 })
  return keepPayment(unit.view(), refund.intent_id, actor.accountId!)
})
