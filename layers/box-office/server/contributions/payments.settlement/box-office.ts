// Box office's part of a payment (Box office specification, part 4, "One payment with several
// owners"). When the money for an order arrives, the order is confirmed and its tickets issued in
// Payments' batch, and the entries returned credit deferred ticket income, performance by
// performance: ticket money is owed to the audience until the performance has taken place. When a
// payment ends without the money, an online order lapses and its seats go back on sale, and a
// reservation being paid at the desk goes back to reserved with its seats intact.
import { sql } from 'drizzle-orm'
import { first, nowMs, type UnitView } from '#kit'
import type { Part, Settlement } from '#modules/payments'
import { refundEntries, tagged } from '../../cancel'
import { confirmOrder } from '../../confirm'
import { exchangeOrder, isExchangeRecord, releaseExchange, settleExchange } from '../../exchange'
import { liveLines, ORDER, type OrderRow } from '../../orders'

const DEFERRED = { key: 'box-office.deferred-ticket-income' }

export default {
  async settle(unit: UnitView, part: Part) {
    // The difference on an exchange to dearer tickets: the exchange is made now.
    if (isExchangeRecord(part.record)) return settleExchange(unit, part)
    const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, part.record)
    if (!order) throw new Error(`No order ${part.record} for payment part ${part.id}`)
    const lines = await liveLines(order.id)
    // The batch refuses unless the order is still waiting for this payment and its total is the part's.
    await confirmOrder(unit, { ...order, total_minor: part.amountMinor }, lines, { from: 'awaiting_payment', intentId: part.intentId })
    const totals = new Map<string, number>()
    for (const line of lines) totals.set(line.performance_id, (totals.get(line.performance_id) ?? 0) + line.amount_minor)
    return tagged(DEFERRED, totals, -1)
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
} satisfies Settlement
