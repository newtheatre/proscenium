// A fixture settlement handler: an order is paid if it is still held, and its income is split
// between earned and deferred, tagged with its performance.
import { first, type UnitView } from '#kit'
import type { OwnerEntry, Part, Settlement } from '#modules/payments'

async function order(id: string) {
  return first<{ amount_minor: number, deferred_minor: number, performance_id: string | null }>('SELECT * FROM tickets_orders WHERE id = ?', id)
}

function entries(o: { amount_minor: number, deferred_minor: number, performance_id: string | null }, sign: number): OwnerEntry[] {
  const out: OwnerEntry[] = []
  const earned = o.amount_minor - o.deferred_minor
  if (earned) out.push({ account: { key: 'tickets.income' }, amountMinor: sign * earned, performanceId: o.performance_id })
  if (o.deferred_minor) out.push({ account: { key: 'tickets.deferred' }, amountMinor: sign * o.deferred_minor, performanceId: o.performance_id })
  return out
}

export default {
  async settle(unit: UnitView, part: Part) {
    // Who paid for which line of a split sale, for the till's test to see.
    ;(globalThis as { ticketsSplits?: Part['splits'] }).ticketsSplits = part.splits
    unit.add({ sql: "UPDATE tickets_orders SET state = 'paid' WHERE id = ? AND state = 'held'", params: [part.record] })
      .expect(1, { code: 'tickets.order.gone', reason: 'This order is no longer held.' })
    const o = await order(part.record)
    if (!o) throw new Error('no such order')
    return entries(o, -1)
  },
  async refunded(_unit: UnitView, part: Part, refund: { amountMinor: number }) {
    const o = await order(part.record)
    return [{ account: { key: 'tickets.income' }, amountMinor: refund.amountMinor, performanceId: o?.performance_id ?? null }]
  },
  release(unit: UnitView, part: Part) {
    unit.add({ sql: "UPDATE tickets_orders SET state = 'released', releases = releases + 1 WHERE id = ? AND state = 'held'", params: [part.record] })
  },
} satisfies Settlement
