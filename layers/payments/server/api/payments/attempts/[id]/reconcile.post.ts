// PAY-04: a person answers an attempt with no answer from the provider's own records. The answer is
// recorded under their name, and settles or fails the payment as a provider's answer would.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, first, Refusal } from '#kit'
import { recordAnswer } from '../../../../answers'

export default defineRoute({
  ability: 'payments.attempt.reconcile',
  record: event => ['payments.attempt', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    outcome: z.enum(['succeeded', 'failed']),
    providerRef: z.string().trim().min(1).max(200).optional(), // not-policy: a provider's reference fits well within this
  }).strict(),
}, async (_event, { input, record, unit }) => {
  const attempt = await first<{ state: string }>('SELECT state FROM payments_attempts WHERE id = ?', record!.id)
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if (attempt.state !== 'unknown') throw new Refusal('payments.attempt.not-unknown', 'Only a payment with no answer is answered by hand.', { status: 409 })
  const answer = input.outcome === 'succeeded'
    ? { state: 'succeeded' as const, providerRef: input.providerRef }
    : { state: 'failed' as const, providerRef: input.providerRef, failureCode: 'reconciled' }
  const result = await recordAnswer(record!.id, answer, { kind: 'person', reconciled: true })
  unit.audit({ action: 'update', record: ['payments.attempt', record!.id] })
  return result
})
