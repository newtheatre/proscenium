// What Needs attention lists (Box office specification, part 5): attempts with no answer, with how
// long each has waited, and payments taken that could not be completed and are not yet refunded.
import { z } from 'zod'
import { all, defineRoute, nowMs } from '#kit'

export default defineRoute({
  ability: 'payments.attempt.reconcile',
  rateLimit: 'default',
  input: z.object({}),
}, async () => {
  const now = nowMs()
  const unknown = await all<{ id: string, intent_id: string, method: string, amount_minor: number, currency: string, provider_ref: string | null, label: string, started_at: number }>(
    `SELECT a.id, a.intent_id, a.method, a.amount_minor, i.currency, a.provider_ref, p.label, a.started_at FROM payments_attempts a
      JOIN payments_intents i ON i.id = a.intent_id JOIN payments_provider_accounts p ON p.id = a.provider_account_id
      WHERE a.state = 'unknown' ORDER BY a.started_at`)
  const unfulfilled = await all<{ id: string, amount_minor: number, currency: string, updated_at: number }>(
    `SELECT i.id, i.amount_minor, i.currency, i.updated_at FROM payments_intents i WHERE i.state = 'unfulfilled'
      AND NOT EXISTS (SELECT 1 FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = i.id AND r.state = 'succeeded')
      ORDER BY i.updated_at`)
  return {
    unknown: unknown.map(a => ({ id: a.id, intentId: a.intent_id, method: a.method, amountMinor: a.amount_minor, currency: a.currency, providerRef: a.provider_ref, provider: a.label, waitingMs: now - a.started_at })),
    unfulfilled: unfulfilled.map(i => ({ id: i.id, amountMinor: i.amount_minor, currency: i.currency, sinceMs: now - i.updated_at })),
  }
})
