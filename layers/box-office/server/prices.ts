// Prices (Box office specification, part 2, box_office_prices). A price change is a new row. The
// price of a ticket type in a band at a performance is the newest row for that performance if it
// has any of its own, and otherwise the newest row for the whole production; a row with no amount
// withdraws the price. One statement says so, for reads and for the guard on going on sale alike.
import { all, nowMs, type UnitView } from '#kit'
import { prices } from './db/schema'

/**
 * The rows in force for the bands pooled at a performance: `?1` the performance, `?2` the moment.
 * A withdrawn price is a row here with no amount, so a caller filters on the amount.
 */
export const PRICES_IN_FORCE = `SELECT p.id, p.band_id, p.ticket_type_id, p.amount_minor, p.currency FROM box_office_prices p
  WHERE p.band_id IN (SELECT o.band_id FROM box_office_pools o WHERE o.performance_id = ?1) AND (p.performance_id IS NULL OR p.performance_id = ?1) AND p.effective_from <= ?2
    AND NOT EXISTS (SELECT 1 FROM box_office_prices n WHERE n.band_id = p.band_id AND n.ticket_type_id = p.ticket_type_id
      AND n.performance_id IS p.performance_id AND n.effective_from <= ?2 AND (n.effective_from > p.effective_from OR (n.effective_from = p.effective_from AND n.id > p.id)))
    AND (p.performance_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM box_office_prices s WHERE s.band_id = p.band_id
      AND s.ticket_type_id = p.ticket_type_id AND s.performance_id = ?1 AND s.effective_from <= ?2))`

export interface Price { id: string, bandId: string, ticketTypeId: string, amountMinor: number, currency: string }

/** What each ticket type costs in each pooled band at this performance, now. Withdrawn prices are left out. */
export async function pricesFor(performanceId: string, at = nowMs()): Promise<Price[]> {
  const rows = await all<{ id: string, band_id: string, ticket_type_id: string, amount_minor: number | null, currency: string }>(PRICES_IN_FORCE, performanceId, at)
  return rows.filter(r => r.amount_minor !== null).map(r => ({ id: r.id, bandId: r.band_id, ticketTypeId: r.ticket_type_id, amountMinor: r.amount_minor!, currency: r.currency }))
}

export interface PriceInput { bandId: string, ticketTypeId: string, performanceId?: string | null, amountMinor: number | null }

/** Sets prices from now on: one new row each. Baskets and orders already written keep theirs. */
export function setPrices(unit: UnitView, productionId: string, currency: string, input: PriceInput[], setBy: string | null): string[] {
  const at = nowMs()
  return unit.insertSet(prices, input.map(p => ({ productionId, performanceId: p.performanceId ?? null, bandId: p.bandId, ticketTypeId: p.ticketTypeId, amountMinor: p.amountMinor, currency, effectiveFrom: at, setBy })))
}
