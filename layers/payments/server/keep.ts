// Keeping a payment the system was returning (Box office specification, part 4, "Keeping a payment
// being returned"). Money taken for a payment that could not complete is kept, not refunded, when the
// buyer had what it paid for anyway, such as being let in at the door after the till gave up on the
// payment. The system's refunds are withdrawn, the owner completes its record or books the income,
// and the money moves from payments.unfulfilled to the owner's accounts in one posting.
import { sql } from 'drizzle-orm'
import { all, first, nowMs, Refusal, type UnitView } from '#kit'
import { postEntries, type EntryInput } from '#modules/finance'
import { asPart, getIntent, partsOf, settlements } from './intents'
import { isTestMoney } from './test-money'
import type { AttemptRow } from './answers'
import { ownerEntries } from './owner-entries'

/**
 * SQL on `payments_intents i`: money taken for a payment that could not complete, neither kept nor
 * back with the buyer yet. A seller's cancelled payment that the provider took after all counts too.
 */
export const BEING_RETURNED = `i.settled_at IS NULL AND i.state IN ('unfulfilled', 'cancelled', 'expired')
  AND EXISTS (SELECT 1 FROM payments_attempts a WHERE a.intent_id = i.id AND a.state = 'succeeded')
  AND NOT EXISTS (SELECT 1 FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = i.id AND r.state = 'succeeded')`

/** The reason a withdrawn refund carries, from the list of reasons for declining a refund. */
export const KEPT_TERM = 'payment-kept'

const NOT_HELD = { code: 'payments.keep.not-held', reason: 'Only a payment that is being returned can be kept.' }
const RETURNED = { code: 'payments.keep.returned', reason: 'Some of this money has already gone back, or a person asked for it back, so it cannot be kept.' }

export interface Kept { intentId: string, keptMinor: number, currency: string, withdrawn: string[] }

/** Keeps, in the caller's unit, the whole of a payment the system is returning. */
export async function keepPayment(unit: UnitView, intentId: string, by: string): Promise<Kept> {
  const intent = await getIntent(intentId)
  if (!intent) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  if (!['cancelled', 'expired', 'unfulfilled'].includes(intent.state) || intent.settled_at !== null) throw new Refusal(NOT_HELD.code, NOT_HELD.reason, { status: 409 })
  const attempts = await all<AttemptRow>("SELECT * FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded' ORDER BY started_at", intent.id)
  const taken = attempts.reduce((sum, a) => sum + a.amount_minor, 0)
  if (!attempts.length) throw new Refusal(NOT_HELD.code, NOT_HELD.reason, { status: 409 })
  if (taken !== intent.amount_minor) {
    throw new Refusal('payments.keep.part-paid', 'Only part of this payment was taken, so it cannot be kept as a whole.', { status: 409, remedy: 'Let the refund go back, then take the payment again.' })
  }
  const refunds = await all<{ id: string, state: string, requested_by: string | null }>(
    'SELECT r.id, r.state, r.requested_by FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = ?', intent.id)
  if (refunds.some(r => r.requested_by !== null || r.state === 'sent' || r.state === 'succeeded')) throw new Refusal(RETURNED.code, RETURNED.reason, { status: 409 })
  const withdrawing = refunds.filter(r => r.state === 'approved').map(r => r.id)
  const term = await first<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'payments.refund-decline-reason' AND slug = ?", KEPT_TERM)
  if (!term) {
    throw new Refusal('payments.keep.no-reason', 'The reason "Payment kept" is missing from the reasons for declining a refund.', { status: 409, remedy: 'Restore it under Payments > Lists, then try again.' })
  }

  const parts = await partsOf(intent.id)
  const at = nowMs()
  if (withdrawing.length) {
    unit.add(sql`UPDATE payments_refunds SET state = 'declined', approved_by = ${by}, decline_reason_term_id = ${term.id}, updated_at = ${at}
      WHERE id IN (SELECT value FROM json_each(${JSON.stringify(withdrawing)})) AND state = 'approved' AND requested_by IS NULL`).expect(withdrawing.length, RETURNED)
  }
  // Settled now, so a later refund of it takes the money back off the owner's income.
  unit.add(sql`UPDATE payments_intent_parts SET settled_at = ${at} WHERE intent_id = ${intent.id} AND settled_at IS NULL`).expect(parts.length, NOT_HELD)
  unit.add(sql`UPDATE payments_intents SET settled_at = ${at}, updated_at = ${at} WHERE id = ${intent.id} AND settled_at IS NULL`).expect(1, NOT_HELD)

  const handlers = await settlements()
  const entries: EntryInput[] = []
  for (const part of parts) {
    const handler = handlers.get(part.owner_module)
    if (!handler?.kept) {
      throw new Refusal('payments.keep.owner-cannot', 'What this payment was for cannot be completed afterwards, so the money has to go back.', { status: 409 })
    }
    const own = await handler.kept(unit, asPart(part, intent.currency))
    const total = own.reduce((sum, e) => sum + e.amountMinor, 0)
    if (total !== -part.amount_minor) throw new Refusal('payments.settlement.part-mismatch', `${part.owner_module}'s entries for this part total ${-total}, not ${part.amount_minor}.`, { status: 500 })
    entries.push(...await ownerEntries(own, part.owner_module))
  }
  if (!await isTestMoney(intent.id)) {
    await postEntries(unit, {
      key: `payments:intent:${intent.id}:kept`,
      source: { module: 'payments', type: 'payments.intent', id: intent.id },
      kind: 'sale',
      currency: intent.currency,
      postedBy: by,
      entries: [{ account: { key: 'payments.unfulfilled' }, amountMinor: taken }, ...entries],
    })
  }
  unit.audit({ action: 'update', record: ['payments.intent', intent.id], detail: { kept: taken, withdrawn: withdrawing.length } })
  return { intentId: intent.id, keptMinor: taken, currency: intent.currency, withdrawn: withdrawing }
}
