// Seating layouts and wheelchair spaces (show walkthrough, Matt 2026-11-17, decisions 5, 6 and 10).
// A space keeps a short list of the ways it is set out; each says how many seats it holds, how many
// wheelchair spaces it has and how many seats each space takes the place of. One is the space's
// usual layout. A performance uses its space's usual layout unless someone chooses another.
//
// The layout is applied through the mechanism the specification already describes (part 3,
// "Wheelchair spaces"): the production's wheelchair band, whose pool at the performance holds the
// layout's spaces, and whose displaced band gives up the seats. Booking a space takes one claim in
// the wheelchair pool and the layout's seats in the seating pool in one batch (capacity.ts); those
// seats are claims of their own that follow the space through every change of state (a trigger).
// Until `box-office.wheelchair.keep-seats-before` before curtain the seats for the spaces still
// unsold are kept back: no ordinary ticket may take them. After that they go on general sale.
//
// Layouts are Box office's, not the core's: they say what Box office sells in a room, they are what
// seating plans will grow from (plans are Box office's, box_office_performance_sales.plan_id), and
// they mean nothing while Box office is off. A layout refers to its space by id only.
import { sql } from 'drizzle-orm'
import type { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { getPerformance, getSpace } from '#modules/core'
import { layoutInput } from './input'

export interface SeatingLayout { id: string, spaceId: string, name: string, seats: number | null, wheelchairSpaces: number, seatsPerSpace: number, usual: boolean }

export { layoutInput }
export type LayoutInput = z.output<typeof layoutInput>

/** Where the wheelchair band sorts: after the production's seating sections. */
const LAST = 999 // not-policy: a sort position after any section a person adds

/** The name of the band Box office makes to hold a production's wheelchair spaces. */
export const WHEELCHAIR_BAND = 'Wheelchair spaces'

const NAME_TAKEN = { code: 'box-office.layout.name-taken', reason: 'This space already has a layout with that name.', fields: { name: 'Choose a different name.' } }
const NOT_FOUND = { code: 'box-office.layout.not-found', reason: 'There is no such seating layout.' }

interface Row { id: string, space_id: string, name: string, seats: number | null, wheelchair_spaces: number, seats_per_space: number, usual: number }
const toLayout = (r: Row): SeatingLayout => ({ id: r.id, spaceId: r.space_id, name: r.name, seats: r.seats, wheelchairSpaces: r.wheelchair_spaces, seatsPerSpace: r.seats_per_space, usual: !!r.usual })

export async function listLayouts(spaceId?: string): Promise<SeatingLayout[]> {
  const rows = spaceId
    ? await all<Row>('SELECT * FROM box_office_seating_layouts WHERE space_id = ? ORDER BY usual DESC, lower(name), id', spaceId)
    : await all<Row>('SELECT * FROM box_office_seating_layouts ORDER BY space_id, usual DESC, lower(name), id')
  return rows.map(toLayout)
}

export async function getLayout(id: string): Promise<SeatingLayout | null> {
  const row = await first<Row>('SELECT * FROM box_office_seating_layouts WHERE id = ?', id)
  return row ? toLayout(row) : null
}

export async function usualLayout(spaceId: string | null): Promise<SeatingLayout | null> {
  if (!spaceId) return null
  const row = await first<Row>('SELECT * FROM box_office_seating_layouts WHERE space_id = ? AND usual = 1', spaceId)
  return row ? toLayout(row) : null
}

/** The layout a performance uses: the one chosen for it, else its space's usual one. */
export async function layoutOf(performanceId: string): Promise<{ layout: SeatingLayout | null, chosen: boolean }> {
  const row = await first<Row>('SELECT l.* FROM box_office_seating_layouts l JOIN box_office_performance_sales s ON s.layout_id = l.id WHERE s.performance_id = ?', performanceId)
  if (row) return { layout: toLayout(row), chosen: true }
  return { layout: await usualLayout((await getPerformance(performanceId)).spaceId), chosen: false }
}

/**
 * What the house holds for a performance: its own capacity or its production's where one is set,
 * else the seats of its layout, else what its space holds.
 */
export async function houseOf(performanceId: string): Promise<number | null> {
  const row = await first<{ own: number | null, production: number | null, space: number | null }>(
    `SELECT f.capacity AS own, p.capacity AS production, s.default_capacity AS space FROM core_performances f
      JOIN core_productions p ON p.id = f.production_id JOIN core_spaces s ON s.id = f.space_id WHERE f.id = ?`, performanceId)
  if (!row) return null
  if (row.own !== null || row.production !== null) return row.own ?? row.production
  const { layout } = await layoutOf(performanceId)
  return layout?.seats ?? row.space
}

// ---------------------------------------------------------------------------------------------
// Applying a layout to a performance

/** The production's wheelchair band, as far as this unit knows: made here earlier, or already there. */
type BandMemo = Map<string, string>
const memos = new WeakMap<UnitView, BandMemo>()

async function wheelchairBand(unit: UnitView, productionId: string): Promise<string> {
  const memo = memos.get(unit) ?? new Map<string, string>()
  memos.set(unit, memo)
  const known = memo.get(productionId) ?? (await first<{ id: string }>("SELECT id FROM box_office_bands WHERE production_id = ? AND kind = 'wheelchair' ORDER BY sort, name LIMIT 1", productionId))?.id
  if (known) {
    memo.set(productionId, known)
    return known
  }
  const id = newId('band')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_bands (id, production_id, name, kind, sort, created_at, updated_at)
    SELECT ${id}, ${productionId}, ${WHEELCHAIR_BAND}, 'wheelchair', ${LAST}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_bands WHERE production_id = ${productionId} AND name = ${WHEELCHAIR_BAND})`)
    .expect(1, { code: 'box-office.band.name-taken', reason: `This production already has a section called ${WHEELCHAIR_BAND}.`, remedy: 'Rename that section, then choose the layout again.' })
  memo.set(productionId, id)
  return id
}

/**
 * Makes a performance use a layout, in the caller's unit: its sales record names the layout, and the
 * pool of its production's wheelchair band holds the layout's spaces. Refused while more spaces are
 * booked than the layout has. With `seats`, a performance sold as one part of the house also takes
 * the layout's seats as its capacity.
 */
export async function applyLayout(unit: UnitView, performanceId: string, layout: SeatingLayout, options: { seats?: boolean } = {}): Promise<void> {
  const performance = await getPerformance(performanceId)
  if (performance.spaceId !== layout.spaceId) refuse('box-office.layout.other-space', 'That layout is for another space.', { status: 422, fields: { layoutId: 'Choose a layout of the space this performance is in.' } })
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_performance_sales (id, performance_id, seating, state, layout_id, created_at, updated_at)
    VALUES (${newId('sale')}, ${performanceId}, 'general', 'draft', ${layout.id}, ${at}, ${at})
    ON CONFLICT (performance_id) DO UPDATE SET layout_id = excluded.layout_id, updated_at = excluded.updated_at`)

  const existing = await first<{ band_id: string, claimed: number }>(
    'SELECT o.band_id, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind = \'wheelchair\' ORDER BY b.sort, b.name LIMIT 1', performanceId)
  if (layout.wheelchairSpaces > 0 || existing) {
    const bandId = existing?.band_id ?? await wheelchairBand(unit, performance.productionId)
    // The seats each space takes come from the production's first seating section, unless it names another.
    unit.add(sql`UPDATE box_office_bands SET displaces_band_id = (SELECT s.id FROM box_office_bands s WHERE s.production_id = ${performance.productionId} AND s.kind = 'standard' ORDER BY s.sort, s.name LIMIT 1), updated_at = ${at}
      WHERE id = ${bandId} AND displaces_band_id IS NULL AND EXISTS (SELECT 1 FROM box_office_bands s WHERE s.production_id = ${performance.productionId} AND s.kind = 'standard')`)
    unit.add(sql`INSERT INTO box_office_pools (id, performance_id, band_id, capacity, claimed, created_at, updated_at) VALUES (${newId('pool')}, ${performanceId}, ${bandId}, ${layout.wheelchairSpaces}, 0, ${at}, ${at})
      ON CONFLICT (performance_id, band_id) DO UPDATE SET capacity = excluded.capacity, updated_at = excluded.updated_at WHERE claimed <= excluded.capacity`)
      .expect(1, { code: 'box-office.layout.spaces-booked', reason: `${existing?.claimed ?? 'Some'} wheelchair spaces are already booked at this performance, more than ${layout.name} has.`, remedy: 'Choose a layout with more wheelchair spaces, or move those bookings first.' })
  }

  if (options.seats && layout.seats !== null) {
    const seating = await all<{ id: string, claimed: number }>(
      'SELECT o.id, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind <> \'wheelchair\'', performanceId)
    if (seating.length === 1) {
      unit.add(sql`UPDATE box_office_pools SET capacity = ${layout.seats}, updated_at = ${at} WHERE id = ${seating[0]!.id} AND claimed <= ${layout.seats}`)
        .expect(1, { code: 'box-office.layout.seats-sold', reason: `${seating[0]!.claimed} seats are already taken at this performance, more than the ${layout.seats} ${layout.name} has.` })
    }
  }
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: { layoutId: layout.id } })
}

/** Performances still to come in a space, set up for sale, with no layout chosen (or using this one). */
async function performancesIn(spaceId: string, layoutId: string | null): Promise<string[]> {
  return (await all<{ id: string }>(
    `SELECT f.id FROM core_performances f JOIN box_office_performance_sales s ON s.performance_id = f.id
      WHERE f.space_id = ? AND f.state IN ('draft', 'scheduled') AND s.state <> 'closed' AND s.layout_id IS ? ORDER BY f.starts_at`, spaceId, layoutId)).map(r => r.id)
}

/** Gives the space's usual layout to its performances to come that have none yet. */
async function applyUsual(unit: UnitView, layout: SeatingLayout): Promise<void> {
  for (const performanceId of await performancesIn(layout.spaceId, null)) {
    // A performance with more spaces booked by hand than the layout has keeps what it has.
    const booked = await first<{ claimed: number }>('SELECT max(o.claimed) AS claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind = \'wheelchair\'', performanceId)
    if ((booked?.claimed ?? 0) > layout.wheelchairSpaces) continue
    await applyLayout(unit, performanceId, layout)
  }
}

// ---------------------------------------------------------------------------------------------
// Managing layouts

async function checkedSpace(spaceId: string) {
  const space = await getSpace(spaceId)
  if (!space) refuse('core.space.not-found', 'There is no such space.', { status: 422, fields: { spaceId: 'Choose a space.' } })
  return space
}

async function refuseTakenName(spaceId: string, name: string, except: string | null) {
  if (await first('SELECT 1 FROM box_office_seating_layouts WHERE space_id = ? AND lower(name) = lower(?) AND id IS NOT ?', spaceId, name, except))
    refuse(NAME_TAKEN.code, NAME_TAKEN.reason, { status: 409, fields: NAME_TAKEN.fields })
}

/** Adds a layout. A space's first layout is its usual one, and is given to its performances to come. */
export async function createLayout(unit: UnitView, input: LayoutInput): Promise<string> {
  await checkedSpace(input.spaceId)
  await refuseTakenName(input.spaceId, input.name, null)
  const isFirst = !(await first('SELECT 1 FROM box_office_seating_layouts WHERE space_id = ?', input.spaceId))
  const id = newId('lay')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_seating_layouts (id, space_id, name, seats, wheelchair_spaces, seats_per_space, usual, created_at, updated_at)
    SELECT ${id}, ${input.spaceId}, ${input.name}, ${input.seats}, ${input.wheelchairSpaces}, ${input.seatsPerSpace}, ${isFirst}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_seating_layouts WHERE space_id = ${input.spaceId} AND lower(name) = lower(${input.name}))`).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: ['core.space', input.spaceId], detail: { layoutId: id } })
  if (isFirst) await applyUsual(unit, { id, ...input, usual: true })
  return id
}

/**
 * Changes a layout. Performances to come that use it take its new numbers; a change that would
 * leave one with more wheelchair spaces booked than the layout has is refused, naming how many.
 */
export async function updateLayout(unit: UnitView, id: string, input: LayoutInput): Promise<void> {
  const before = await getLayout(id)
  if (!before) refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 404 })
  if (input.spaceId !== before.spaceId) refuse('box-office.layout.space-fixed', 'A layout stays with its space.', { status: 422, fields: { spaceId: 'Add a new layout to the other space instead.' } })
  await refuseTakenName(before.spaceId, input.name, id)
  unit.add(sql`UPDATE box_office_seating_layouts SET name = ${input.name}, seats = ${input.seats}, wheelchair_spaces = ${input.wheelchairSpaces}, seats_per_space = ${input.seatsPerSpace}, updated_at = ${nowMs()}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM box_office_seating_layouts WHERE space_id = ${before.spaceId} AND lower(name) = lower(${input.name}) AND id <> ${id})`).expect(1, NAME_TAKEN)
  const after: SeatingLayout = { ...before, ...input }
  for (const performanceId of await performancesIn(before.spaceId, id)) await applyLayout(unit, performanceId, after)
  unit.audit({ action: 'update', record: ['core.space', before.spaceId], detail: { layoutId: id } })
}

/** Makes a layout its space's usual one, given to the space's performances to come that have none yet. */
export async function makeUsual(unit: UnitView, id: string): Promise<void> {
  const layout = await getLayout(id)
  if (!layout) refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 404 })
  const at = nowMs()
  unit.add(sql`UPDATE box_office_seating_layouts SET usual = 0, updated_at = ${at} WHERE space_id = ${layout.spaceId} AND usual = 1 AND id <> ${id}`)
  unit.add(sql`UPDATE box_office_seating_layouts SET usual = 1, updated_at = ${at} WHERE id = ${id}`).expect(1, NOT_FOUND)
  await applyUsual(unit, { ...layout, usual: true })
  unit.audit({ action: 'update', record: ['core.space', layout.spaceId], detail: { usualLayoutId: id } })
}

/** Removes a layout no performance still to come uses. */
export async function deleteLayout(unit: UnitView, id: string): Promise<void> {
  const layout = await getLayout(id)
  if (!layout) refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 404 })
  const using = await performancesIn(layout.spaceId, id)
  if (using.length) refuse('box-office.layout.in-use', `${using.length === 1 ? 'A performance still to come uses' : `${using.length} performances still to come use`} this layout.`, { status: 409, remedy: 'Choose another layout for them first.', detail: { performanceId: using[0]! } })
  unit.add(sql`DELETE FROM box_office_seating_layouts WHERE id = ${id}`).expect(1, NOT_FOUND)
  // Performances that have taken place keep their record of it as a name no longer listed.
  unit.add(sql`UPDATE box_office_performance_sales SET layout_id = NULL WHERE layout_id = ${id}`)
  unit.audit({ action: 'delete', record: ['core.space', layout.spaceId], detail: { layoutId: id } })
}

/**
 * After a performance moves to another space: it takes the new space's usual layout, or none. A
 * layout that cannot be given (more spaces booked than it has) leaves the performance as it was.
 */
export async function relayout(unit: UnitView, performanceId: string): Promise<void> {
  const { layout, chosen } = await layoutOf(performanceId)
  const performance = await getPerformance(performanceId)
  if (chosen && layout?.spaceId === performance.spaceId) return
  const usual = await usualLayout(performance.spaceId)
  if (usual) {
    const booked = await first<{ claimed: number }>('SELECT o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind = \'wheelchair\'', performanceId)
    if ((booked?.claimed ?? 0) <= usual.wheelchairSpaces && await first('SELECT 1 FROM box_office_performance_sales WHERE performance_id = ?', performanceId)) await applyLayout(unit, performanceId, usual)
  }
  else if (chosen) unit.add(sql`UPDATE box_office_performance_sales SET layout_id = NULL, updated_at = ${nowMs()} WHERE performance_id = ${performanceId}`)
}

// ---------------------------------------------------------------------------------------------
// Wheelchair spaces at a performance, for taking claims and saying what is free

/**
 * A performance's wheelchair pool and what booking one space does: `units` seats taken from
 * `seatPoolId`, and until `keepUntil` the seats of every unsold space kept back from ordinary sale.
 * Without a layout, a wheelchair band takes seats only where it names a displaced band (the
 * specification's set-up by hand).
 */
export interface Displacement { performanceId: string, wheelchairPoolId: string, seatPoolId: string | null, units: number, keepUntil: number | null }

export async function displacementsFor(poolIds: string[]): Promise<Displacement[]> {
  if (!poolIds.length) return []
  const rows = await all<{ performance_id: string, wheelchair_pool: string, seat_pool: string | null, layout_id: string | null, seats_per_space: number | null, displaces_band_id: string | null, displaces_units: number }>(
    `SELECT w.performance_id, w.id AS wheelchair_pool, s.layout_id, l.seats_per_space, b.displaces_band_id, b.displaces_units,
        coalesce((SELECT p.id FROM box_office_pools p WHERE p.performance_id = w.performance_id AND p.band_id = b.displaces_band_id),
          (SELECT p.id FROM box_office_pools p JOIN box_office_bands sb ON sb.id = p.band_id WHERE p.performance_id = w.performance_id AND sb.kind = 'standard' ORDER BY sb.sort, sb.name LIMIT 1)) AS seat_pool
      FROM box_office_pools w JOIN box_office_bands b ON b.id = w.band_id AND b.kind = 'wheelchair'
        LEFT JOIN box_office_performance_sales s ON s.performance_id = w.performance_id
        LEFT JOIN box_office_seating_layouts l ON l.id = s.layout_id
      WHERE w.performance_id IN (SELECT o.performance_id FROM box_office_pools o WHERE o.id IN (SELECT value FROM json_each(?)))`, JSON.stringify(poolIds))
  if (!rows.length) return []
  const keepFor = (await useSetting('box-office.wheelchair.keep-seats-before') as number) * 1000 // not-policy: seconds to milliseconds
  const starts = new Map<string, number>()
  for (const id of new Set(rows.map(r => r.performance_id))) starts.set(id, (await getPerformance(id)).startsAt)
  return rows.map((r) => {
    const units = r.layout_id ? (r.seats_per_space ?? 0) : (r.displaces_band_id ? r.displaces_units : 0)
    const seatPoolId = units > 0 ? r.seat_pool : null
    return { performanceId: r.performance_id, wheelchairPoolId: r.wheelchair_pool, seatPoolId, units: seatPoolId ? units : 0, keepUntil: seatPoolId && keepFor > 0 ? starts.get(r.performance_id)! - keepFor : null }
  })
}
