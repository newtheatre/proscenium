// Box office's part of a payment (Box office specification, part 4, "One payment with several
// owners"). When the money for an order arrives, the order is confirmed and its tickets issued in
// Payments' batch, and the entries returned credit deferred ticket income, performance by
// performance: ticket money is owed to the audience until the performance has taken place. When a
// payment ends without the money, an online order lapses and its seats go back on sale, and a
// reservation being paid at the desk goes back to reserved with its seats intact.
import { sql } from 'drizzle-orm'
import { all, first, nowMs, refuse, type UnitView } from '#kit'
import { accountLabel } from '#modules/core'
import { defaultTaxCode } from '#modules/finance'
import { payersOf, type OwnerEntry, type Part, type ReceiptPerson, type Settlement } from '#modules/payments'
import { refundEntries, spread, tagged } from '../../cancel'
import { confirmOrder } from '../../confirm'
import { exchangeOrder, isExchangeRecord, releaseExchange, settleExchange } from '../../exchange'
import { passPayers, passSalesMinor } from '../../pass-sales'
import { liveLines, ORDER, type OrderRow } from '../../orders'
import { deskReceiptLink } from '../../desk'
import { codedLines } from '../../vat'

const DEFERRED = { key: 'box-office.deferred-ticket-income' }
const PASS_INCOME = { key: 'box-office.pass-income' }

const handler = {
  async settle(unit: UnitView, part: Part) {
    // The difference on an exchange to dearer tickets: the exchange is made now.
    if (isExchangeRecord(part.record)) return settleExchange(unit, part)
    const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, part.record)
    if (!order) throw new Error(`No order ${part.record} for payment part ${part.id}`)
    const lines = await liveLines(order.id)
    // The batch refuses unless the order is still waiting for this payment and its total is the part's.
    // In a sale split between people, a pass goes to whoever paid for it.
    const passHolders = await passPayers(unit, order.id, await payersOf(part.intentId, { module: 'box-office', record: order.id }))
    await confirmOrder(unit, { ...order, total_minor: part.amountMinor }, lines, { from: 'awaiting_payment', intentId: part.intentId, passHolders })
    // By performance and by the tax code of each line's ticket type (BO-78).
    const totals = new Map<string, number>()
    for (const line of await codedLines(lines)) totals.set(line.performance_id, (totals.get(line.performance_id) ?? 0) + line.amount_minor)
    // Money for a pass is income when it is paid, in a line of its own, not shared between performances.
    const passMinor = await passSalesMinor(order.id)
    return [...await tagged(DEFERRED, totals, -1), ...(passMinor ? [{ account: PASS_INCOME, amountMinor: -passMinor, performanceId: null, taxCode: await defaultTaxCode() }] : [])]
  },

  // The till's receipt carries a desk sale's tickets: the booking joins the buyer and the receipt links to it.
  async receiptLink(unit: UnitView, part: Part, person: ReceiptPerson) {
    if (isExchangeRecord(part.record)) return null
    return deskReceiptLink(unit, part.record, person)
  },

  // The money for cancelled tickets has gone back: it is no longer owed to the audience.
  async refunded(_unit: UnitView, part: Part, refund: { id: string, amountMinor: number }) {
    return refundEntries(isExchangeRecord(part.record) ? await exchangeOrder(part.record) : part.record, refund)
  },

  async release(unit: UnitView, part: Part) {
    if (isExchangeRecord(part.record)) return releaseExchange(unit, part)
    const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, part.record)
    // Called twice, or after the order moved on: nothing is waiting for this payment.
    if (!order || order.state !== 'awaiting_payment' || order.intent_id !== part.intentId) return
    const at = nowMs()
    const waiting = sql`id = ${order.id} AND state = 'awaiting_payment' AND intent_id = ${part.intentId}`
    const reservation = await first('SELECT 1 AS one FROM box_office_holds WHERE order_id = ? AND kind = \'reservation\'', order.id)
    if (reservation) {
      unit.add(sql`UPDATE box_office_orders SET state = 'reserved', intent_id = NULL, session_id = NULL, admit_on_payment = 0, expires_at = NULL, updated_at = ${at} WHERE ${waiting}`)
      return
    }
    unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'payment_failed'
      WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${order.id})
        AND EXISTS (SELECT 1 FROM box_office_orders WHERE ${waiting})`)
    unit.add(sql`UPDATE box_office_orders SET state = 'expired', expires_at = NULL, updated_at = ${at} WHERE ${waiting}`)
    unit.announce('box-office.order.expired', { orderId: order.id }, { record: ['box-office.order', order.id] })
  },

  // Money kept for a payment that could not complete: a reservation still waiting is confirmed with it,
  // and a booking that lapsed stays as it is, its money ticket income for its performances.
  async kept(unit: UnitView, part: Part): Promise<OwnerEntry[]> {
    if (isExchangeRecord(part.record)) refuse('box-office.order.cannot-keep', 'An exchange that did not complete cannot be kept, so its money has to go back.', { status: 409 })
    const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, part.record)
    if (!order) throw new Error(`No order ${part.record} for payment part ${part.id}`)
    if (order.state === 'confirmed') {
      refuse('box-office.order.paid-another-way', 'This booking has been paid for another way, so this payment really is owed back.', { status: 409, remedy: 'Let the refund go back to the buyer.' })
    }
    if (order.state === 'awaiting_payment') {
      refuse('box-office.order.payment-in-progress', 'A payment is being taken for this booking right now.', { status: 409, remedy: 'Finish or cancel that payment, then try again.' })
    }
    if (order.state === 'reserved') {
      const mismatch = { code: 'box-office.order.kept-total', reason: 'This booking no longer costs what was taken, so the payment cannot be kept against it.', remedy: 'Let the refund go back, then take the payment again.' }
      if (order.total_minor !== part.amountMinor) refuse(mismatch.code, mismatch.reason, { status: 409, remedy: mismatch.remedy })
      unit.add(sql`UPDATE box_office_orders SET state = 'awaiting_payment', intent_id = ${part.intentId}, updated_at = ${nowMs()}
        WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${part.amountMinor}`).expect(1, mismatch)
      return handler.settle(unit, part)
    }
    // Lapsed or cancelled: the tickets it was for, live or not, say which performances earned it.
    const lines = await all<{ id: string, performance_id: string, amount_minor: number }>(
      "SELECT id, performance_id, amount_minor FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' ORDER BY (state = 'live') DESC, id", order.id)
    if (!lines.length) refuse('box-office.order.cannot-keep', 'This booking has no tickets to keep the money for, so it has to go back.', { status: 409 })
    unit.audit({ action: 'update', record: ['box-office.order', order.id], detail: { kept: part.amountMinor, intentId: part.intentId } })
    return tagged(DEFERRED, spread(await codedLines(lines), part.amountMinor), -1)
  },

  // The order behind a part (an exchange's own order), by its reference and buyer, for money screens.
  async describe(record: string) {
    const orderId = isExchangeRecord(record) ? await exchangeOrder(record) : record
    const order = await first<{ id: string, reference: string, account_id: string | null }>('SELECT id, reference, account_id FROM box_office_orders WHERE id = ?', orderId)
    if (!order) return null
    return { reference: order.reference, buyer: order.account_id ? await accountLabel(order.account_id) : null, to: `/console/box-office/orders/${order.id}` }
  },
} satisfies Settlement

export default handler
