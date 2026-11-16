// What is free and what it costs, for public pages and the season calendar (Box office
// specification, part 4, services). A lapsed hold nobody has swept counts as free, as it is for the
// next buyer.
import { all, nowMs } from '#kit'
import { getPerformance } from '#modules/core'
import { offSaleAt } from './baskets'
import { pricesFor } from './prices'
import { salesOf, type SaleState } from './setup'

export interface Availability {
  performanceId: string
  /** `none` when the performance is not sold here at all. */
  state: SaleState | 'none'
  onSaleAt: number | null
  bands: { bandId: string, name: string, kind: string, capacity: number, free: number, lowestMinor: number | null, prices: { ticketTypeId: string, amountMinor: number }[] }[]
  currency: string | null
}

export async function availability(performanceId: string): Promise<Availability> {
  const sales = await salesOf(performanceId)
  if (!sales) return { performanceId, state: 'none', onSaleAt: null, bands: [], currency: null }
  const performance = await getPerformance(performanceId)
  const at = nowMs()
  const [pools, prices] = await Promise.all([
    all<{ band_id: string, name: string, kind: string, capacity: number, free: number }>(
      `SELECT o.band_id, b.name, b.kind, o.capacity, o.capacity - o.claimed + (SELECT count(*) FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id
          WHERE c.pool_id = o.id AND c.state = 'held' AND c.expires_at IS NOT NULL AND c.expires_at <= ?1 AND h.kind <> 'payment') AS free
        FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ?2 ORDER BY b.sort, b.name`, at, performanceId),
    pricesFor(performanceId, at),
  ])
  const over = performance.state !== 'scheduled' || at >= await offSaleAt(sales, performance.startsAt)
  return {
    performanceId,
    state: over && sales.state !== 'draft' ? 'closed' : sales.state,
    onSaleAt: sales.onSaleAt,
    currency: prices[0]?.currency ?? null,
    bands: pools.map((p) => {
      const own = prices.filter(x => x.bandId === p.band_id).map(x => ({ ticketTypeId: x.ticketTypeId, amountMinor: x.amountMinor }))
      return { bandId: p.band_id, name: p.name, kind: p.kind, capacity: p.capacity, free: p.free, lowestMinor: own.length ? Math.min(...own.map(x => x.amountMinor)) : null, prices: own }
    }),
  }
}
