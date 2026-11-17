// Prices (Box office specification, part 2, box_office_prices). A price change is a new row. The
// price of a ticket type in a band at a performance is the newest row for that performance if it
// has one of its own, and otherwise the newest row for the whole production; a row with no amount
// withdraws the price. A performance's own row that `inherits` hands the price back to the
// production's. One statement says so, for reads and for the guard on going on sale alike.
import { all, nowMs, type UnitView } from '#kit'
import { prices } from './db/schema'

/** The newest row of one scope, for a row `x` of it: nothing newer of the same key and scope by `?2`. */
const NEWEST = (x: string) => `NOT EXISTS (SELECT 1 FROM box_office_prices n WHERE n.band_id = ${x}.band_id AND n.ticket_type_id = ${x}.ticket_type_id
      AND n.performance_id IS ${x}.performance_id AND n.effective_from <= ?2 AND (n.effective_from > ${x}.effective_from OR (n.effective_from = ${x}.effective_from AND n.id > ${x}.id)))`

/**
 * The rows in force for the bands pooled at a performance: `?1` the performance, `?2` the moment.
 * A withdrawn price is a row here with no amount, so a caller filters on the amount.
 */
export const PRICES_IN_FORCE = `SELECT p.id, p.band_id, p.ticket_type_id, p.amount_minor, p.currency FROM box_office_prices p
  WHERE p.band_id IN (SELECT o.band_id FROM box_office_pools o WHERE o.performance_id = ?1) AND (p.performance_id IS NULL OR p.performance_id = ?1) AND p.effective_from <= ?2
    AND p.inherits = 0 AND ${NEWEST('p')}
    AND (p.performance_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM box_office_prices s WHERE s.band_id = p.band_id
      AND s.ticket_type_id = p.ticket_type_id AND s.performance_id = ?1 AND s.effective_from <= ?2 AND s.inherits = 0 AND ${NEWEST('s')}))`

export interface Price { id: string, bandId: string, ticketTypeId: string, amountMinor: number, currency: string }

/** What each ticket type costs in each pooled band at this performance, now. Withdrawn prices are left out. */
export async function pricesFor(performanceId: string, at = nowMs()): Promise<Price[]> {
  const rows = await all<{ id: string, band_id: string, ticket_type_id: string, amount_minor: number | null, currency: string }>(PRICES_IN_FORCE, performanceId, at)
  return rows.filter(r => r.amount_minor !== null).map(r => ({ id: r.id, bandId: r.band_id, ticketTypeId: r.ticket_type_id, amountMinor: r.amount_minor!, currency: r.currency }))
}

export interface PriceInput {
  bandId: string
  ticketTypeId: string
  performanceId?: string | null
  amountMinor: number | null
  /** For one performance: follow the production's price again. The amount is ignored. */
  inherit?: boolean
}

/** Sets prices from now on: one new row each. Baskets and orders already written keep theirs. */
export function setPrices(unit: UnitView, productionId: string, currency: string, input: PriceInput[], setBy: string | null): string[] {
  const at = nowMs()
  return unit.insertSet(prices, input.map((p) => {
    const inherits = !!p.inherit && !!p.performanceId
    return { productionId, performanceId: p.performanceId ?? null, bandId: p.bandId, ticketTypeId: p.ticketTypeId, amountMinor: inherits ? null : p.amountMinor, inherits, currency, effectiveFrom: at, setBy }
  }))
}

/**
 * Each band and ticket type's price at a performance, layer by layer, for the screen that sets them:
 * what all the production's performances are charged, and this performance's own price where it
 * has one. `own` is null while the performance follows the production; an own price with no amount
 * means the ticket is not sold at this performance.
 */
export interface PriceLayer { bandId: string, ticketTypeId: string, production: number | null, own: { amountMinor: number | null } | null }

export async function priceLayers(productionId: string, performanceId: string, at = nowMs()): Promise<PriceLayer[]> {
  const rows = await all<{ band_id: string, ticket_type_id: string, performance_id: string | null, amount_minor: number | null, inherits: number }>(
    `SELECT p.band_id, p.ticket_type_id, p.performance_id, p.amount_minor, p.inherits FROM box_office_prices p
      WHERE p.production_id = ?1 AND (p.performance_id IS NULL OR p.performance_id = ?3) AND p.effective_from <= ?2 AND ${NEWEST('p')} -- not-policy: ?3 is the statement's third parameter
    `,
    productionId, at, performanceId)
  const out = new Map<string, PriceLayer>()
  for (const r of rows) {
    const key = `${r.band_id} ${r.ticket_type_id}`
    const layer = out.get(key) ?? { bandId: r.band_id, ticketTypeId: r.ticket_type_id, production: null, own: null }
    if (r.performance_id === null) layer.production = r.amount_minor
    else if (!r.inherits) layer.own = { amountMinor: r.amount_minor }
    out.set(key, layer)
  }
  return [...out.values()]
}
