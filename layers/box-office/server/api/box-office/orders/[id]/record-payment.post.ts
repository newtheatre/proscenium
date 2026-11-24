// Record money taken outside the site for a booking that lapsed unpaid, once its performance is past
// selling (Box office specification, part 4, "A payment taken outside the site").
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, requireAbility } from '#kit'
import { recordLatePayment } from '../../../../late-payment'

export default defineRoute({
  ability: 'box-office.order.take-payment',
  record: event => ['box-office.order', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ providerAccountId: z.string().min(1).max(64), note: z.string().trim().min(1).max(500) }).strict(), // not-policy: field lengths
}, async (_event, { actor, input, record, unit }) => {
  // Saying money was taken is answering for it, as settling an unanswered payment is.
  await requireAbility(actor, 'payments.attempt.reconcile')
  return recordLatePayment(unit.view(), record!.id!, input, actor.accountId!)
})
