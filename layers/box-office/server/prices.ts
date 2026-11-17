// Prices (Box office specification, part 2, box_office_prices). A price change is a new row. The
// price of a ticket type in a band at a performance is the newest row for that performance if it
// has one of its own, and otherwise the newest row for the whole production; a row with no amount
// withdraws the price. A performance's own row that `inherits` hands the price back to the
// production's. One statement says so, for reads and for the guard on going on sale alike.
//
// A change may be set to take effect later (early-bird prices, a planned rise): its row simply
// carries a later effective_from. Cancelling one adds a row at the same moment that repeats what
// was in force before it; being newer, it wins at that moment, and the table stays append-only.
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

/** Sets prices from now on, or from `from`: one new row each. Baskets and orders already written keep theirs. */
export function setPrices(unit: UnitView, productionId: string, currency: string, input: PriceInput[], setBy: string | null, from?: number): string[] {
  const at = from ?? nowMs()
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

interface Row { id: string, band_id: string, ticket_type_id: string, performance_id: string | null, amount_minor: number | null, inherits: number, effective_from: number }
const COLUMNS = 'p.id, p.band_id, p.ticket_type_id, p.performance_id, p.amount_minor, p.inherits, p.effective_from'

/** One scope's row in force at a moment: the production's (performance null) or one performance's own. */
async function inForce(productionId: string, bandId: string, ticketTypeId: string, performanceId: string | null, at: number): Promise<Row | null> {
  const [row] = await all<Row>(
    `SELECT ${COLUMNS} FROM box_office_prices p WHERE p.production_id = ?1 AND p.band_id = ?3 AND p.ticket_type_id = ?4 AND p.performance_id IS ?5 AND p.effective_from <= ?2 -- not-policy: numbered parameters
      ORDER BY p.effective_from DESC, p.id DESC LIMIT 1`, // not-policy: the statement's parameters
    productionId, at, bandId, ticketTypeId, performanceId)
  return row ?? null
}

/** Whether two rows say the same: the same amount, or both following the production. */
const sameAs = (a: Row | null, b: Row | null): boolean => {
  const follows = (r: Row | null) => !r || (r.performance_id !== null && !!r.inherits)
  if (follows(a) || follows(b)) return follows(a) && follows(b)
  return a!.amount_minor === b!.amount_minor
}

/** A price change set to take effect later. `amountMinor` null withdraws the price; `inherits` hands it back to the production. */
export interface ScheduledPrice { bandId: string, ticketTypeId: string, performanceId: string | null, amountMinor: number | null, inherits: boolean, from: number }

/**
 * The price changes still to come for a production's prices and one performance's own, soonest
 * first. A change cancelled, or one that changes nothing, is left out.
 */
export async function scheduledPrices(productionId: string, performanceId: string, at = nowMs()): Promise<ScheduledPrice[]> {
  const rows = await all<Row>(
    `SELECT ${COLUMNS} FROM box_office_prices p WHERE p.production_id = ?1 AND (p.performance_id IS NULL OR p.performance_id = ?3) AND p.effective_from > ?2 -- not-policy: numbered parameters
      AND NOT EXISTS (SELECT 1 FROM box_office_prices n WHERE n.band_id = p.band_id AND n.ticket_type_id = p.ticket_type_id AND n.performance_id IS p.performance_id
        AND n.effective_from = p.effective_from AND n.id > p.id)
      ORDER BY p.effective_from, p.id`, // not-policy: ?3 is the statement's third parameter
    productionId, at, performanceId)
  const out: ScheduledPrice[] = []
  for (const r of rows) {
    const before = await inForce(productionId, r.band_id, r.ticket_type_id, r.performance_id, r.effective_from - 1)
    if (sameAs(before, r)) continue
    out.push({ bandId: r.band_id, ticketTypeId: r.ticket_type_id, performanceId: r.performance_id, amountMinor: r.amount_minor, inherits: !!r.inherits, from: r.effective_from })
  }
  return out
}

/**
 * Cancels a change set for later: a row at the same moment that repeats what was in force just
 * before it. Returns false when there is no such change to cancel.
 */
export async function cancelScheduledPrice(unit: UnitView, productionId: string, currency: string, change: { bandId: string, ticketTypeId: string, performanceId: string | null, from: number }, setBy: string | null): Promise<boolean> {
  if (change.from <= nowMs()) return false
  const target = await inForce(productionId, change.bandId, change.ticketTypeId, change.performanceId, change.from)
  if (!target || target.effective_from !== change.from) return false
  const before = await inForce(productionId, change.bandId, change.ticketTypeId, change.performanceId, change.from - 1)
  if (sameAs(before, target)) return false
  const inherits = change.performanceId !== null && (!before || !!before.inherits)
  unit.insertSet(prices, [{ productionId, performanceId: change.performanceId, bandId: change.bandId, ticketTypeId: change.ticketTypeId, amountMinor: inherits ? null : before?.amount_minor ?? null, inherits, currency, effectiveFrom: change.from, setBy }])
  return true
}
