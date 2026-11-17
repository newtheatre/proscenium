// Box office's part of a payment (Box office specification, part 4, "One payment with several
// owners"). When the money for an order arrives, the order is confirmed and its tickets issued in
// Payments' batch, and the entries returned credit deferred ticket income, performance by
// performance: ticket money is owed to the audience until the performance has taken place. When a
// payment ends without the money, an online order lapses and its seats go back on sale, and a
// reservation being paid at the desk goes back to reserved with its seats intact.
import { sql } from 'drizzle-orm'
import { first, nowMs, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import type { OwnerEntry, Part, Settlement } from '#modules/payments'
import { confirmOrder } from '../../confirm'
import { liveLines, ORDER, type LineRow, type OrderRow } from '../../orders'

const DEFERRED = { key: 'box-office.deferred-ticket-income' }

// The lines' amounts by performance, each tagged with its production for the ledger's reports.
async function byPerformance(lines: LineRow[], sign: number): Promise<OwnerEntry[]> {
  const totals = new Map<string, number>()
  for (const line of lines) totals.set(line.performance_id, (totals.get(line.performance_id) ?? 0) + line.amount_minor)
  return Promise.all([...totals].filter(([, amount]) => amount !== 0).map(async ([performanceId, amount]) => ({
    account: DEFERRED,
    amountMinor: sign * amount,
    performanceId,
    productionId: (await getPerformance(performanceId)).productionId,
  })))
}

export default {
  async settle(unit: UnitView, part: Part) {
    const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, part.record)
    if (!order) throw new Error(`No order ${part.record} for payment part ${part.id}`)
    const lines = await liveLines(order.id)
    // The batch refuses unless the order is still waiting for this payment and its total is the part's.
    await confirmOrder(unit, { ...order, total_minor: part.amountMinor }, lines, { from: 'awaiting_payment', intentId: part.intentId })
    return byPerformance(lines, -1)
  },

  // Cancelling and refunding tickets arrive with their own slice; until then a refund Payments
  // makes of this part comes off deferred income for the order's first performance.
  async refunded(_unit: UnitView, part: Part, refund: { amountMinor: number }) {
    const [line] = await liveLines(part.record)
    return [{ account: DEFERRED, amountMinor: refund.amountMinor, performanceId: line?.performance_id ?? null }]
  },

  async release(unit: UnitView, part: Part) {
    const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, part.record)
    // Called twice, or after the order moved on: nothing is waiting for this payment.
    if (!order || order.state !== 'awaiting_payment' || order.intent_id !== part.intentId) return
    const at = nowMs()
    const waiting = sql`id = ${order.id} AND state = 'awaiting_payment' AND intent_id = ${part.intentId}`
    const reservation = await first('SELECT 1 AS one FROM box_office_holds WHERE order_id = ? AND kind = \'reservation\'', order.id)
    if (reservation) {
      unit.add(sql`UPDATE box_office_orders SET state = 'reserved', intent_id = NULL, expires_at = NULL, updated_at = ${at} WHERE ${waiting}`)
      return
    }
    unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'payment_failed'
      WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${order.id})
        AND EXISTS (SELECT 1 FROM box_office_orders WHERE ${waiting})`)
    unit.add(sql`UPDATE box_office_orders SET state = 'expired', expires_at = NULL, updated_at = ${at} WHERE ${waiting}`)
    unit.announce('box-office.order.expired', { orderId: order.id }, { record: ['box-office.order', order.id] })
  },
} satisfies Settlement
