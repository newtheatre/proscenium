// Telling the people who have booked when a show's guidance gains something they would want to know
// first (C-57; the content warnings proposal, "Box office and Communications"). Effects are named,
// as they are public safety information; content warnings never are, because an inbox is not
// private: the message only says that some were added and links to the page.
import { all, nowMs, type UnitView } from '#kit'
import { beforeYouCome, getPerformance, notify } from '#modules/core'
import { ORDER, type OrderRow } from './orders'

/** Orders with live tickets for a performance of this production that has not started. */
async function upcomingBookings(productionId: string, now: number): Promise<{ order: OrderRow, performanceId: string }[]> {
  const rows = await all<{ order_id: string, performance_id: string }>(
    `SELECT DISTINCT l.order_id, l.performance_id FROM box_office_order_lines l
       JOIN core_performances f ON f.id = l.performance_id
       JOIN box_office_orders o ON o.id = l.order_id
      WHERE f.production_id = ? AND f.state = 'scheduled' AND f.starts_at > ? AND l.kind = 'ticket' AND l.state = 'live' AND o.state IN ('reserved', 'confirmed')
      ORDER BY l.order_id, l.performance_id`,
    productionId, now,
  )
  const byOrder = new Map<string, string>()
  for (const r of rows) if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, r.performance_id)
  const orders: { order: OrderRow, performanceId: string }[] = []
  for (const [orderId, performanceId] of byOrder) {
    const [order] = await all<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
    if (order) orders.push({ order, performanceId })
  }
  return orders
}

export async function guidanceAdded(unit: UnitView, productionId: string, added: { effectTermIds: string[], depicted: boolean }, eventId: string): Promise<void> {
  if (!added.effectTermIds.length && !added.depicted) return
  const block = await beforeYouCome(productionId)
  if (!block) return
  const effects = block.effects.filter(e => added.effectTermIds.includes(e.termId)).map(e => e.label)
  const lines = [
    effects.length ? `It now uses ${effects.join(', ').toLowerCase()}${effects.length === 1 ? '' : ' (each of these is new)'}.` : '',
    added.depicted ? 'Its content warnings have changed.' : '',
  ].filter(Boolean)
  for (const { order, performanceId } of await upcomingBookings(productionId, nowMs())) {
    if (!order.account_id) continue
    const performance = await getPerformance(performanceId)
    await notify(unit, 'box-office.guidance-added', {
      to: order.account_id,
      variables: { reference: order.reference, show: performance.productionTitle, what: lines.join(' '), pageUrl: block.pageUrl },
      subject: ['box-office.order', order.id],
      dedupeKey: `guidance-added:${order.id}:${eventId}`,
    })
  }
}
