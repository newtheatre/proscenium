// PAY-04: a person answers an attempt with no answer from the provider's own records. The answer is
// recorded under their name, and settles or fails the payment as a provider's answer would. Money taken
// for a payment the till had already given up on is returned, unless they say to keep it.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, first, Refusal, requireAbility } from '#kit'
import { recordAnswer } from '../../../../answers'
import { keepPayment } from '../../../../keep'

export default defineRoute({
  ability: 'payments.attempt.reconcile',
  record: event => ['payments.attempt', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({
    outcome: z.enum(['succeeded', 'failed']),
    providerRef: z.string().trim().min(1).max(200).optional(), // not-policy: a provider's reference fits well within this
    keep: z.boolean().optional(),
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  const attempt = await first<{ state: string, intent_id: string }>('SELECT state, intent_id FROM payments_attempts WHERE id = ?', record!.id)
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if (attempt.state !== 'unknown') throw new Refusal('payments.attempt.not-unknown', 'Only a payment with no answer is answered by hand.', { status: 409 })
  if (input.keep && input.outcome !== 'succeeded') throw new Refusal('payments.keep.not-taken', 'Only a payment that went through can be kept.', { status: 422 })
  // Keeping it withdraws the system's refund, which only someone who may approve refunds does.
  if (input.keep) await requireAbility(actor, 'payments.refund.approve')
  const answer = input.outcome === 'succeeded'
    ? { state: 'succeeded' as const, providerRef: input.providerRef }
    : { state: 'failed' as const, providerRef: input.providerRef, failureCode: 'reconciled' }
  const result = await recordAnswer(record!.id, answer, { kind: 'person', reconciled: true })
  unit.audit({ action: 'update', record: ['payments.attempt', record!.id] })
  // The answer is committed on its own; keeping it is this request's unit, refused cleanly if it cannot be kept.
  const held = await first<{ n: number }>("SELECT count(*) AS n FROM payments_intents WHERE id = ? AND state IN ('cancelled', 'expired', 'unfulfilled') AND settled_at IS NULL", attempt.intent_id)
  const kept = input.keep && held?.n ? await keepPayment(unit.view(), attempt.intent_id, actor.accountId!) : null
  return { ...result, kept: !!kept }
})
