// What is free and what it costs, for public pages and the season calendar (Box office
// specification, part 4, services). A lapsed hold nobody has swept counts as free, as it is for the
// next buyer.
import { all, nowMs } from '#kit'
import { getPerformance } from '#modules/core'
import { offSaleAt } from './baskets'
import { displacementsFor } from './layouts'
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
    all<{ id: string, band_id: string, name: string, kind: string, capacity: number, free: number }>(
      `SELECT o.id, o.band_id, b.name, b.kind, o.capacity, o.capacity - o.claimed + (SELECT count(*) FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id
          WHERE c.pool_id = o.id AND c.state = 'held' AND c.expires_at IS NOT NULL AND c.expires_at <= ?1 AND h.kind <> 'payment') AS free
        FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ?2 ORDER BY b.sort, b.name`, at, performanceId),
    pricesFor(performanceId, at),
  ])
  // Wheelchair spaces (layouts.ts): a space is free while its pool has room and the seats it takes are
  // free; until the keep-back time, the seats of the spaces still unsold are not free to anyone else.
  const plans = await displacementsFor(pools.map(p => p.id))
  const freeOf = new Map(pools.map(p => [p.id, Math.max(0, p.free)]))
  const shownFree = (pool: { id: string, free: number }) => {
    const space = plans.find(d => d.wheelchairPoolId === pool.id)
    if (space?.seatPoolId) return Math.min(freeOf.get(pool.id)!, Math.floor((freeOf.get(space.seatPoolId) ?? 0) / space.units))
    const kept = plans.filter(d => d.seatPoolId === pool.id && d.keepUntil !== null && at < d.keepUntil).reduce((sum, d) => sum + (freeOf.get(d.wheelchairPoolId) ?? 0) * d.units, 0)
    return Math.max(0, freeOf.get(pool.id)! - kept)
  }
  const over = performance.state !== 'scheduled' || at >= await offSaleAt(sales, performance.startsAt)
  return {
    performanceId,
    state: over && sales.state !== 'draft' ? 'closed' : sales.state,
    onSaleAt: sales.onSaleAt,
    currency: prices[0]?.currency ?? null,
    // A layout with no wheelchair spaces leaves an empty wheelchair pool, which is not offered.
    bands: pools.filter(p => !(p.kind === 'wheelchair' && p.capacity === 0)).map((p) => {
      const own = prices.filter(x => x.bandId === p.band_id).map(x => ({ ticketTypeId: x.ticketTypeId, amountMinor: x.amountMinor }))
      return { bandId: p.band_id, name: p.name, kind: p.kind, capacity: p.capacity, free: shownFree(p), lowestMinor: own.length ? Math.min(...own.map(x => x.amountMinor)) : null, prices: own }
    }),
  }
}
