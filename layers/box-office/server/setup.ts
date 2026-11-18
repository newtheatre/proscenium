// Setting a performance up for sale (Box office specification, part 3, "A performance on sale";
// story BO-01). Box office owns the sales record and the pools that divide the house into bands;
// the core owns the performance and its capacity. Every guard is on the statement that it guards.
import { sql } from 'drizzle-orm'
import { all, can, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { methodsFor } from '#modules/payments'
import { houseOf, reapply, setPerformanceChoice, type ChoiceInput } from './layouts'
import { PRICES_IN_FORCE, pricesFor, type Price } from './prices'

export type SaleState = 'draft' | 'on_sale' | 'paused' | 'closed'

export interface SalesRecord {
  id: string
  performanceId: string
  seating: 'general' | 'allocated'
  state: SaleState
  onSaleAt: number | null
  offSaleAt: number | null
  maxPerOrder: number | null
  holdMinutes: number | null
  /** Minutes before the start that unpaid reservations are released; null means the setting's. */
  releaseMinutes: number | null
  paymentTiming: 'pay-now' | 'reserve' | 'buyer-chooses' | null
  /** The seating layout chosen or given (layouts.ts), or null. */
  layoutId: string | null
  /** Wheelchair spaces typed in instead of a layout, and the seats each takes; null with a layout or none. */
  wheelchairSpaces: number | null
  seatsPerSpace: number | null
  /** Whether the layout or numbers are this performance's own, not its run's or its space's usual. */
  layoutOwn: boolean
  /** The section a wheelchair space's seats come from; null for the first seating section. */
  seatsBandId: string | null
}

/** Whether a layout or typed numbers give the performance its wheelchair spaces. */
export const laidOut = (sales: SalesRecord | null) => !!sales && (sales.layoutId !== null || sales.wheelchairSpaces !== null)

export interface Pool { id: string, bandId: string, bandName: string, bandKind: string, capacity: number, claimed: number }

interface SalesRow { id: string, performance_id: string, seating: 'general' | 'allocated', state: SaleState, on_sale_at: number | null, off_sale_at: number | null, max_per_order: number | null, hold_minutes: number | null, release_minutes: number | null, payment_timing: 'pay-now' | 'reserve' | 'buyer-chooses' | null, layout_id: string | null, wheelchair_spaces: number | null, seats_per_space: number | null, layout_own: number, seats_band_id: string | null }

const toSales = (r: SalesRow): SalesRecord => ({ id: r.id, performanceId: r.performance_id, seating: r.seating, state: r.state, onSaleAt: r.on_sale_at, offSaleAt: r.off_sale_at, maxPerOrder: r.max_per_order, holdMinutes: r.hold_minutes, releaseMinutes: r.release_minutes, paymentTiming: r.payment_timing, layoutId: r.layout_id, wheelchairSpaces: r.wheelchair_spaces, seatsPerSpace: r.seats_per_space, layoutOwn: !!r.layout_own, seatsBandId: r.seats_band_id })

/**
 * When a performance's unpaid reservations are released: its own minutes before the start, or the
 * setting's. Null when neither is set, and staff release them by hand.
 */
export async function releaseTime(startsAt: number, ownMinutes: number | null): Promise<number | null> {
  if (ownMinutes !== null) return startsAt - ownMinutes * 60_000 // not-policy: minutes to milliseconds
  const before = await useSetting('box-office.reservations.release-before') as number | null
  return before === null ? null : startsAt - before * 1000 // not-policy: seconds to milliseconds
}

export async function salesOf(performanceId: string): Promise<SalesRecord | null> {
  const row = await first<SalesRow>('SELECT * FROM box_office_performance_sales WHERE performance_id = ?', performanceId)
  return row ? toSales(row) : null
}

export async function poolsOf(performanceId: string): Promise<Pool[]> {
  const rows = await all<{ id: string, band_id: string, name: string, kind: string, capacity: number, claimed: number }>(
    `SELECT o.id, o.band_id, b.name, b.kind, o.capacity, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id
      WHERE o.performance_id = ? ORDER BY b.sort, b.name`, performanceId)
  return rows.map(r => ({ id: r.id, bandId: r.band_id, bandName: r.name, bandKind: r.kind, capacity: r.capacity, claimed: r.claimed }))
}

// ---------------------------------------------------------------------------------------------
// Ticket types and bands

export { createTicketType, listTicketTypes, type TicketTypeInput } from './ticket-types'

export interface BandInput { name: string, kind?: 'standard' | 'wheelchair' | 'restricted_view', sort?: number }

export function createBand(unit: UnitView, productionId: string, input: BandInput): string {
  const id = newId('band')
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO box_office_bands (id, production_id, name, kind, sort, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM box_office_bands WHERE production_id = ? AND name = ?)',
    params: [id, productionId, input.name, input.kind ?? 'standard', input.sort ?? 0, at, at, productionId, input.name],
  }).expect(1, { code: 'box-office.band.name-taken', reason: 'This production already has a band with that name.' })
  unit.audit({ action: 'create', record: ['core.production', productionId], detail: { bandId: id } })
  return id
}

/** Renames a band, or changes its kind. Its prices, seats and sales stay with it. */
export function updateBand(unit: UnitView, productionId: string, bandId: string, input: { name?: string, kind?: BandInput['kind'] }): void {
  unit.add({
    sql: `UPDATE box_office_bands SET name = coalesce(?, name), kind = coalesce(?, kind), updated_at = ? WHERE id = ? AND production_id = ?
      AND NOT EXISTS (SELECT 1 FROM box_office_bands o WHERE o.production_id = ? AND o.name = ? AND o.id <> ?)`,
    params: [input.name ?? null, input.kind ?? null, nowMs(), bandId, productionId, productionId, input.name ?? null, bandId],
  }).expect(1, { code: 'box-office.band.name-taken', reason: 'This production already has a band with that name, or the band is not this production\'s.' })
  unit.audit({ action: 'update', record: ['core.production', productionId], detail: { bandId } })
}

/**
 * Removes a band nothing has been priced, held or sold in, with its seat counts. A band that has
 * been priced or sold stays, so what was charged can still be read: set its seats to none instead.
 */
export function deleteBand(unit: UnitView, productionId: string, bandId: string): void {
  const unused = sql`NOT EXISTS (SELECT 1 FROM box_office_prices WHERE band_id = ${bandId})
    AND NOT EXISTS (SELECT 1 FROM box_office_order_lines WHERE band_id = ${bandId})
    AND NOT EXISTS (SELECT 1 FROM box_office_comp_requests WHERE band_id = ${bandId})
    AND NOT EXISTS (SELECT 1 FROM box_office_exchanges WHERE band_id = ${bandId})
    AND NOT EXISTS (SELECT 1 FROM box_office_bands WHERE displaces_band_id = ${bandId})
    AND NOT EXISTS (SELECT 1 FROM box_office_claims c JOIN box_office_pools p ON p.id = c.pool_id WHERE p.band_id = ${bandId})`
  unit.add(sql`DELETE FROM box_office_pools WHERE band_id = ${bandId} AND EXISTS (SELECT 1 FROM box_office_bands WHERE id = ${bandId} AND production_id = ${productionId}) AND ${unused}`)
  unit.add(sql`DELETE FROM box_office_bands WHERE id = ${bandId} AND production_id = ${productionId} AND ${unused}`)
    .expect(1, { code: 'box-office.band.in-use', reason: 'This band has prices or tickets, so it cannot be removed.', remedy: 'Set its seats to 0 so nothing more is sold in it.' })
  unit.audit({ action: 'delete', record: ['core.production', productionId], detail: { bandId } })
}

export async function listBands(productionId: string): Promise<{ id: string, name: string, kind: string, sort: number }[]> {
  return all('SELECT id, name, kind, sort FROM box_office_bands WHERE production_id = ? ORDER BY sort, name', productionId)
}

// ---------------------------------------------------------------------------------------------
// The sales record and its pools

export interface SalesInput {
  pools?: { bandId: string, capacity: number }[]
  onSaleAt?: number | null
  offSaleAt?: number | null
  maxPerOrder?: number | null
  holdMinutes?: number | null
  releaseMinutes?: number | null
  /** Says in so many words that the pools may hold more than the space does. */
  confirmOverVenue?: boolean
  /** Wheelchair spaces of its own (a copy's). Left out, a performance takes its run's or its space's usual. */
  wheelchair?: ChoiceInput
}

/**
 * Makes or changes the sales record of a performance and the capacity of its pools. A capacity
 * below what is claimed is refused on the statement, quoting how many are claimed. Pools that add
 * up to more than the core's capacity need a person who may exceed it to say so.
 */
export async function saveSales(unit: UnitView, performanceId: string, input: SalesInput, actor: Actor): Promise<void> {
  const performance = await getPerformance(performanceId)
  if (performance.state === 'cancelled' || performance.state === 'completed') refuse('box-office.performance.over', 'This performance is cancelled or has taken place, so its sales cannot be changed.')
  const at = nowMs()
  const before = await salesOf(performanceId)
  const has = (key: keyof SalesInput) => input[key] !== undefined
  unit.add({
    sql: `INSERT INTO box_office_performance_sales (id, performance_id, seating, state, on_sale_at, off_sale_at, max_per_order, hold_minutes, release_minutes, created_at, updated_at)
      VALUES (?, ?, 'general', 'draft', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (performance_id) DO UPDATE SET on_sale_at = CASE WHEN ? THEN excluded.on_sale_at ELSE on_sale_at END, off_sale_at = CASE WHEN ? THEN excluded.off_sale_at ELSE off_sale_at END,
        max_per_order = CASE WHEN ? THEN excluded.max_per_order ELSE max_per_order END, hold_minutes = CASE WHEN ? THEN excluded.hold_minutes ELSE hold_minutes END,
        release_minutes = CASE WHEN ? THEN excluded.release_minutes ELSE release_minutes END, updated_at = excluded.updated_at`,
    params: [newId('sale'), performanceId, input.onSaleAt ?? null, input.offSaleAt ?? null, input.maxPerOrder ?? null, input.holdMinutes ?? null, input.releaseMinutes ?? null, at, at, has('onSaleAt'), has('offSaleAt'), has('maxPerOrder'), has('holdMinutes'), has('releaseMinutes')],
  })
  // Reservations already made move to the new release time; one marked to keep stays kept.
  if (has('releaseMinutes')) {
    const releaseAt = await releaseTime(performance.startsAt, input.releaseMinutes ?? null)
    unit.add(sql`UPDATE box_office_orders SET release_at = ${releaseAt}, updated_at = ${at} WHERE state = 'reserved' AND id IN (
      SELECT order_id FROM box_office_order_lines WHERE performance_id = ${performanceId} AND kind = 'ticket' AND state = 'live')`)
  }

  const wanted = input.pools ?? []
  if (wanted.length) {
    const bands = await all<{ id: string, kind: string, displaces_band_id: string | null }>('SELECT id, kind, displaces_band_id FROM box_office_bands WHERE production_id = ?', performance.productionId)
    const known = new Map(bands.map(b => [b.id, b]))
    for (const pool of wanted) if (!known.has(pool.bandId)) refuse('box-office.band.not-found', 'One of these bands does not belong to this production.', { status: 422 })
    if (new Set(wanted.map(p => p.bandId)).size !== wanted.length) refuse('box-office.band.repeated', 'A band is listed twice.', { status: 422 })

    // The house the pools divide: the seats. Wheelchair spaces are counted apart, or come out of the seats.
    const existing = await poolsOf(performanceId)
    const next = new Map(existing.map(p => [p.bandId, p.capacity]))
    for (const pool of wanted) next.set(pool.bandId, pool.capacity)
    const total = [...next].filter(([bandId]) => known.get(bandId)?.kind !== 'wheelchair').reduce((sum, [, capacity]) => sum + capacity, 0)
    const house = await houseOf(performanceId)
    let confirmedBy: string | null = null
    if (house !== null && total > house) {
      const reason = `These bands hold ${total} between them, more than the ${house} the space holds.`
      if (!(await can(actor, 'box-office.performance.exceed-venue', ['core.performance', performanceId])).allowed) refuse('box-office.capacity.over-venue', reason, { remedy: 'Lower a band, or ask someone who may sell above the space\'s capacity.' })
      if (!input.confirmOverVenue) refuse('box-office.capacity.confirm-over-venue', reason, { remedy: 'Confirm that you mean to sell more than the space holds.' })
      confirmedBy = actor.accountId ?? null
    }
    const claimed = new Map(existing.map(p => [p.bandId, p.claimed]))
    for (const pool of wanted) {
      unit.add({
        sql: `INSERT INTO box_office_pools (id, performance_id, band_id, capacity, claimed, over_venue_confirmed_by, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
          ON CONFLICT (performance_id, band_id) DO UPDATE SET capacity = excluded.capacity, over_venue_confirmed_by = excluded.over_venue_confirmed_by, updated_at = excluded.updated_at
          WHERE claimed <= excluded.capacity`,
        params: [newId('pool'), performanceId, pool.bandId, pool.capacity, confirmedBy, at, at],
      }).expect(1, { code: 'box-office.capacity.below-claimed', reason: `${claimed.get(pool.bandId) ?? 'Some'} seats in this band are already sold or held, so its capacity cannot go below that.` })
    }
  }

  // Wheelchair spaces: the performance's own where asked, else its run's or its space's usual (layouts.ts).
  if (input.wheelchair) await setPerformanceChoice(unit, performanceId, input.wheelchair)
  else if (!before || !laidOut(before)) await reapply(unit, performanceId, { create: true })
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: { pools: wanted.length } })
}

// ---------------------------------------------------------------------------------------------
// Going on sale

export interface ChecklistItem { code: string, done: boolean }

/** What going on sale needs, each with whether it is there. The same rules guard the statement. */
export async function checklist(performanceId: string): Promise<{ items: ChecklistItem[], prices: Price[], pools: Pool[] }> {
  const performance = await getPerformance(performanceId)
  const [pools, prices] = await Promise.all([poolsOf(performanceId), pricesFor(performanceId)])
  const priced = new Set(prices.map(p => p.bandId))
  const paid = prices.some(p => p.amountMinor > 0)
  const canPay = !paid || (await methodsFor('online')).length > 0 || (await methodsFor('desk')).length > 0
  return {
    pools,
    prices,
    items: [
      { code: 'scheduled', done: performance.state === 'scheduled' },
      { code: 'capacity', done: pools.some(p => p.capacity > 0) },
      // Wheelchair spaces are priced from the seats around them, so their pool needs no price of its own.
      { code: 'prices', done: pools.some(p => p.bandKind !== 'wheelchair') && pools.every(p => p.bandKind === 'wheelchair' || priced.has(p.bandId)) },
      { code: 'payment', done: canPay },
    ],
  }
}

const MISSING: Record<string, string> = {
  scheduled: 'The performance is not scheduled yet.',
  capacity: 'No section has any seats to sell.',
  prices: 'A section has no price.',
  payment: 'A ticket has a price and there is no way to pay: add a payment provider first.',
}

/**
 * Draft or paused to on sale. Refused, naming what is missing, while a band has no price, no band
 * has capacity, or a paid price has no way to pay. The pools and prices are judged again on the
 * statement, so a price withdrawn at the same moment cannot put an unpriced band on sale.
 */
export async function openSales(unit: UnitView, performanceId: string): Promise<void> {
  const { items } = await checklist(performanceId)
  const missing = items.find(i => !i.done)
  if (missing) refuse(`box-office.sales.needs-${missing.code}`, MISSING[missing.code]!, { remedy: 'Finish setting the performance up, then put it on sale.' })
  unit.add({
    sql: `UPDATE box_office_performance_sales SET state = 'on_sale', updated_at = ?2 WHERE performance_id = ?1 AND state IN ('draft', 'paused')
      AND EXISTS (SELECT 1 FROM box_office_pools o WHERE o.performance_id = ?1 AND o.capacity > 0)
      AND NOT EXISTS (SELECT 1 FROM box_office_pools o WHERE o.performance_id = ?1 AND o.band_id NOT IN (SELECT id FROM box_office_bands WHERE kind = 'wheelchair')
        AND NOT EXISTS (SELECT 1 FROM (${PRICES_IN_FORCE}) f WHERE f.band_id = o.band_id AND f.amount_minor IS NOT NULL))`,
    params: [performanceId, nowMs()],
  }).expect(1, { code: 'box-office.sales.not-ready', reason: 'This performance could not be put on sale: it is already on sale or closed, or its set-up changed a moment ago.', remedy: 'Reload and check the list of what is missing.' })
  unit.announce('box-office.performance.opened', { performanceId }, { record: ['core.performance', performanceId] })
  unit.audit({ action: 'state', record: ['core.performance', performanceId], detail: { to: 'on_sale' } })
}

/** On sale to paused. New baskets are refused; baskets already open can still be paid. */
export function pauseSales(unit: UnitView, performanceId: string): void {
  unit.add({ sql: "UPDATE box_office_performance_sales SET state = 'paused', updated_at = ? WHERE performance_id = ? AND state = 'on_sale'", params: [nowMs(), performanceId] })
    .expect(1, { code: 'box-office.sales.not-on-sale', reason: 'This performance is not on sale.' })
  unit.announce('box-office.performance.paused', { performanceId }, { record: ['core.performance', performanceId] })
  unit.audit({ action: 'state', record: ['core.performance', performanceId], detail: { to: 'paused' } })
}
