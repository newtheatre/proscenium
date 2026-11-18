// The signed-in person's own bookings, for My tickets (C3): every order on their account, through the
// account scope so an account merged into theirs brings its bookings too, one visit per performance,
// with the tickets they can show at the door. Upcoming first, soonest first; past ones after, latest
// first. A basket, an expired order and a cancelled one are left out.
import { sql } from 'drizzle-orm'
import { inAccountScope, nowMs, useDb } from '#kit'
import { getPerformance, getProduction, placeOf } from '#modules/core'
import { liveLines } from './orders'
import { lineKey, unnamedLines } from './line-names'
import { doorCodesForOrders } from './tickets'

export interface MyVisit {
  orderId: string
  reference: string
  state: 'reserved' | 'awaiting_payment' | 'confirmed'
  currency: string
  /** What is still to pay at the box office for a reservation; nought once paid. */
  amountDueMinor: number
  performance: { id: string, startsAt: number, endsAt: number, venue: string, state: string }
  production: { title: string, slug: string }
  /** One per ticket line. A reservation's tickets have no code until they are paid for. */
  tickets: { lineId: string, label: string, doorCode: string | null, admitted: boolean }[]
}

interface OrderRow { id: string, reference: string, state: MyVisit['state'], currency: string, total_minor: number }

export async function myBookings(accountId: string): Promise<{ upcoming: MyVisit[], past: MyVisit[] }> {
  const orders = await useDb().all<OrderRow>(sql`SELECT id, reference, state, currency, total_minor FROM box_office_orders
    WHERE ${inAccountScope('account_id', accountId)} AND state IN ('reserved', 'awaiting_payment', 'confirmed')
    ORDER BY created_at DESC LIMIT 200`) // not-policy: a page's worth
  const codes = new Map((await doorCodesForOrders(orders.filter(o => o.state === 'confirmed').map(o => o.id))).map(t => [t.lineId, t]))
  const visits: MyVisit[] = []
  for (const order of orders) {
    const lines = await liveLines(order.id)
    const unnamed = await unnamedLines(lines)
    for (const performanceId of new Set(lines.map(l => l.performance_id))) {
      const performance = await getPerformance(performanceId).catch(() => null)
      const production = performance ? await getProduction(performance.productionId).catch(() => null) : null
      if (!performance || !production) continue
      visits.push({
        orderId: order.id,
        reference: order.reference,
        state: order.state,
        currency: order.currency,
        amountDueMinor: order.state === 'confirmed' ? 0 : order.total_minor,
        performance: { id: performance.id, startsAt: performance.startsAt, endsAt: performance.endsAt, venue: placeOf(performance.spaceName, performance.venueName), state: performance.state },
        production: { title: production.title, slug: production.slug },
        tickets: lines.filter(l => l.performance_id === performanceId).map(l => ({
          lineId: l.id,
          // Empty where there is one kind to book, as Choose tickets shows it.
          label: unnamed.has(lineKey(l)) ? '' : l.band_name ? `${l.band_name}, ${l.type_name}` : l.type_name,
          doorCode: codes.get(l.id)?.doorCode ?? null,
          admitted: codes.get(l.id)?.admitted ?? false,
        })),
      })
    }
  }
  const now = nowMs()
  return {
    upcoming: visits.filter(v => v.performance.endsAt >= now).sort((a, b) => a.performance.startsAt - b.performance.startsAt),
    past: visits.filter(v => v.performance.endsAt < now).sort((a, b) => b.performance.startsAt - a.performance.startsAt),
  }
}
