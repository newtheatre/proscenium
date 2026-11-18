// Prices (Box office specification, part 2, box_office_prices). A price change is a new row. The
// price of a ticket type in a band at a performance is the newest row for that performance if it
// has one of its own, and otherwise the newest row for the whole production; a row with no amount
// withdraws the price. A performance's own row that `inherits` hands the price back to the
// production's. One statement says so, for reads and for the guard on going on sale alike.
//
// A change may be set to take effect later (early-bird prices, a planned rise): its row simply
// carries a later effective_from. Cancelling one adds a row at the same moment that repeats what
// was in force before it; being newer, it wins at that moment, and the table stays append-only.
import { all, nowMs, useSetting, type UnitView } from '#kit'
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

/**
 * `derived` marks a price no one set: the Wheelchair space's or the Access ticket's, taken from
 * another type's (accessPrices). `house` marks one taken from anywhere in the house rather than its own band.
 */
export interface Price { id: string, bandId: string, ticketTypeId: string, amountMinor: number, currency: string, derived?: true, house?: true }

/** The Wheelchair space type Box office keeps, while the access scheme runs. */
export const WHEELCHAIR_TYPE = 'box-office.wheelchair'
/** The ordinary Access ticket Box office keeps for everyone else on the scheme (Matt, 2026-11-18). */
export const ACCESS_TYPE = 'box-office.access'

/** What each ticket type costs in each pooled band at this performance, now. Withdrawn prices are left out. */
export async function pricesFor(performanceId: string, at = nowMs()): Promise<Price[]> {
  const [rows, wheelchairBands] = await Promise.all([
    all<{ id: string, band_id: string, ticket_type_id: string, amount_minor: number | null, currency: string }>(PRICES_IN_FORCE, performanceId, at),
    // With a seating layout or typed numbers, the production's wheelchair band holds the performance's wheelchair spaces (layouts.ts).
    all<{ band_id: string }>(`SELECT o.band_id FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id JOIN box_office_performance_sales s ON s.performance_id = o.performance_id
      WHERE o.performance_id = ? AND b.kind = 'wheelchair' AND (s.layout_id IS NOT NULL OR s.wheelchair_spaces IS NOT NULL)`, performanceId),
  ])
  const set = rows.filter(r => r.amount_minor !== null).map(r => ({ id: r.id, bandId: r.band_id, ticketTypeId: r.ticket_type_id, amountMinor: r.amount_minor!, currency: r.currency }))
  return accessPrices(set, new Set(wheelchairBands.map(b => b.band_id)))
}

/**
 * A wheelchair space costs the lowest price anyone can have in its band (Matt, 2026-11-17): the
 * cheapest type sold everywhere that asks for nothing, such as Concession. A buyer who qualifies for
 * a cheaper type, such as Member, pays that instead (baskets.ts). Its price row is the one it is
 * taken from. A band where the theatre has set a Wheelchair space price of its own keeps that.
 * The Access ticket, for everyone else on the scheme, is priced the same way in each band of seats
 * (Matt, 2026-11-18).
 *
 * With a seating layout the spaces are counted in the wheelchair band: there, and only there, a
 * Wheelchair space is sold, at the lowest such price anywhere in the house, and nothing else is.
 */
async function accessPrices(set: Price[], wheelchairBands: Set<string>): Promise<Price[]> {
  const enabled = set.length > 0 && await useSetting('core.access-scheme.enabled')
  const types = enabled
    ? await all<{ id: string, managed_by: string | null, requirement_refs: string | null, kind: string, channel: string, active: number }>(
        'SELECT id, managed_by, requirement_refs, kind, channel, active FROM box_office_ticket_types')
    : []
  const wheelchair = types.find(t => t.managed_by === WHEELCHAIR_TYPE && t.active)
  const access = types.find(t => t.managed_by === ACCESS_TYPE && t.active)
  const kept = new Set([wheelchair?.id, access?.id].filter((id): id is string => !!id))
  const open = openTypes(types, kept)
  const seats = set.filter(p => !wheelchairBands.has(p.bandId) && !(wheelchairBands.size && p.ticketTypeId === wheelchair?.id))
  const out: Price[] = []
  // Each kept type takes the lowest open price in each band of seats it has no price of its own in.
  const derive = (typeId: string, among: Price[]) => {
    for (const bandId of new Set(among.map(p => p.bandId))) {
      if (among.some(p => p.bandId === bandId && p.ticketTypeId === typeId)) continue
      const lowest = among.filter(p => p.bandId === bandId && open.has(p.ticketTypeId)).sort((a, b) => a.amountMinor - b.amountMinor)[0]
      if (lowest) out.push({ ...lowest, ticketTypeId: typeId, derived: true })
    }
  }
  if (access) derive(access.id, seats)
  if (wheelchairBands.size) {
    if (wheelchair) {
      const lowest = seats.filter(p => open.has(p.ticketTypeId)).sort((a, b) => a.amountMinor - b.amountMinor)[0]
      for (const bandId of wheelchairBands) {
        const own = set.find(p => p.bandId === bandId && p.ticketTypeId === wheelchair.id)
        if (own) out.push(own)
        else if (lowest) out.push({ ...lowest, bandId, ticketTypeId: wheelchair.id, derived: true, house: true })
      }
    }
    return [...seats, ...out]
  }
  if (wheelchair) derive(wheelchair.id, set)
  return [...set, ...out]
}

/** The types anyone may choose a kept access type's price from: sold everywhere, asking for nothing. */
function openTypes(types: { id: string, requirement_refs: string | null, kind: string, channel: string, active: number }[], kept: Set<string>): Set<string> {
  return new Set(types.filter(t => t.active && t.channel === 'all' && (t.kind === 'standard' || t.kind === 'concession') && !kept.has(t.id)
    && (!t.requirement_refs || t.requirement_refs === '[]')).map(t => t.id))
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
