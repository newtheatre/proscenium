// Fundraising's part of a payment (FR-02, rules M1, D6): settle receives the gift and credits its
// fund; a refund reverses as much as was refunded; a payment that never completed leaves the gift
// abandoned. Each is safe to run twice.
import { first, nowMs, type UnitView } from '#kit'
import type { Part, Settlement } from '#modules/payments'
import { donationFor, fundAccount, receive } from '../../receipt'

export default {
  settle: receive,

  async refunded(unit: UnitView, part: Part, refund: { id: string, amountMinor: number }) {
    const gift = await donationFor(part)
    if (!gift) throw new Error(`No donation ${part.record} for payment part ${part.id}`)
    unit.add({
      sql: `UPDATE fundraising_donations SET refunded_minor = refunded_minor + ?,
        state = CASE WHEN refunded_minor + ? >= amount_minor THEN 'refunded' ELSE state END, updated_at = ?
        WHERE id = ? AND state = 'received' AND refunded_minor + ? <= amount_minor`,
      params: [refund.amountMinor, refund.amountMinor, nowMs(), gift.id, refund.amountMinor],
    }).expect(1, { code: 'fundraising.refund.too-much', reason: 'More would be refunded than was given.' })
    unit.announce('fundraising.donation.refunded', { donationId: gift.id, refundedMinor: gift.refunded_minor + refund.amountMinor }, { record: ['fundraising.donation', gift.id] })
    return [{ account: fundAccount(gift.fund_id), amountMinor: refund.amountMinor, productionId: gift.production_id }]
  },

  release(unit: UnitView, part: Part) {
    unit.add({ sql: "UPDATE fundraising_donations SET state = 'abandoned', updated_at = ? WHERE id = ? AND state = 'pending' AND intent_id = ?", params: [nowMs(), part.record, part.intentId] })
  },

  async describe(record: string) {
    const row = await first<{ reference: string | null, donor: string | null }>('SELECT reference, coalesce(donor_name, acknowledge_as) AS donor FROM fundraising_donations WHERE id = ?', record)
    return row ? { reference: row.reference ?? 'Gift', buyer: row.donor, to: `/console/fundraising/donations/${record}` } : null
  },
} satisfies Settlement
