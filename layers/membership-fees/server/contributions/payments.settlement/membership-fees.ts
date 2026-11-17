// The fees module's part of a payment (rules P4, P5, P7). The part's record is the charge. When the
// money arrives, the charge is paid and the membership activated in Payments' own batch, and the fee
// is income in full that day (P6). A charge that is no longer waiting for this payment, or a
// membership that has expired, been withdrawn or ended, refuses: nothing settles and Payments
// refunds the money (P5).
import { first, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { endRefunded, markPaid } from '#modules/membership'
import type { Part, Settlement } from '#modules/payments'
import type { ChargeRow } from '../../charges'

const INCOME = { key: 'membership-fees.income' }

const chargeFor = (part: Part) => first<ChargeRow>('SELECT id, membership_id, amount_minor, currency, state, intent_id, refunded_minor, paid_at FROM membership_fees_charges WHERE id = ?', part.record)

export default {
  async settle(unit: UnitView, part: Part) {
    const charge = await chargeFor(part)
    if (!charge || charge.state !== 'open' || charge.intent_id !== part.intentId || charge.amount_minor !== part.amountMinor)
      refuse('membership-fees.charge.not-waiting', 'This fee is no longer waiting for this payment.', { status: 409 })
    const at = nowMs()
    unit.add({
      sql: "UPDATE membership_fees_charges SET state = 'paid', channel = 'online', paid_at = ?, updated_at = ? WHERE id = ? AND state = 'open' AND intent_id = ?",
      params: [at, at, charge!.id, part.intentId],
    }).expect(1, { code: 'membership-fees.charge.not-waiting', reason: 'This fee is no longer waiting for this payment.' })
    await markPaid(unit, charge!.membership_id)
    unit.announce('membership-fees.charge.paid', { chargeId: charge!.id, membershipId: charge!.membership_id }, { record: ['membership-fees.charge', charge!.id] })
    return [{ account: INCOME, amountMinor: -part.amountMinor }]
  },

  // P7: the reversing entries, and the charge updated. A full refund ends the membership where the setting says so.
  async refunded(unit: UnitView, part: Part, refund: { id: string, amountMinor: number }) {
    const charge = await chargeFor(part)
    if (!charge) throw new Error(`No charge ${part.record} for payment part ${part.id}`)
    const full = charge.refunded_minor + refund.amountMinor >= charge.amount_minor
    unit.add({
      sql: 'UPDATE membership_fees_charges SET refunded_minor = refunded_minor + ?, state = ?, updated_at = ? WHERE id = ? AND refunded_minor + ? <= amount_minor',
      params: [refund.amountMinor, full ? 'refunded' : 'part-refunded', nowMs(), charge.id, refund.amountMinor],
    }).expect(1, { code: 'membership-fees.refund.too-much', reason: 'More would be refunded than was paid.' })
    if (full && await useSetting('membership-fees.refunds.end-on-full-refund') !== false) endRefunded(unit, charge.membership_id)
    unit.announce('membership-fees.charge.refunded', { chargeId: charge.id, membershipId: charge.membership_id }, { record: ['membership-fees.charge', charge.id] })
    return [{ account: INCOME, amountMinor: refund.amountMinor }]
  },

  // The payment did not complete: the charge stays open, with no payment, so "Pay now" opens a fresh one.
  release(unit: UnitView, part: Part) {
    unit.add({ sql: "UPDATE membership_fees_charges SET intent_id = NULL, updated_at = ? WHERE id = ? AND state = 'open' AND intent_id = ?", params: [nowMs(), part.record, part.intentId] })
  },
} satisfies Settlement
