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
import { layoutInput, wheelchairChoice } from './input'

export interface SeatingLayout { id: string, spaceId: string, name: string, seats: number | null, wheelchairSpaces: number, seatsPerSpace: number, seatsSection: string | null, usual: boolean }

export { layoutInput, wheelchairChoice }
export type LayoutInput = z.output<typeof layoutInput>

/** Where the wheelchair band sorts: after the production's seating sections. */
const LAST = 999 // not-policy: a sort position after any section a person adds

/** The name of the band Box office makes to hold a production's wheelchair spaces. */
export const WHEELCHAIR_BAND = 'Wheelchair spaces'

const NAME_TAKEN = { code: 'box-office.layout.name-taken', reason: 'This space already has a layout with that name.', fields: { name: 'Choose a different name.' } }
const NOT_FOUND = { code: 'box-office.layout.not-found', reason: 'There is no such seating layout.' }

interface Row { id: string, space_id: string, name: string, seats: number | null, wheelchair_spaces: number, seats_per_space: number, seats_section: string | null, usual: number }
const toLayout = (r: Row): SeatingLayout => ({ id: r.id, spaceId: r.space_id, name: r.name, seats: r.seats, wheelchairSpaces: r.wheelchair_spaces, seatsPerSpace: r.seats_per_space, seatsSection: r.seats_section, usual: !!r.usual })

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

/**
 * What gives a performance its wheelchair spaces: a layout of its space, or numbers typed in (Matt
 * 2026-11-17, 21:58: a show picks a layout or types its own numbers, and one performance can override).
 */
export interface Arrangement { layout: SeatingLayout | null, spaces: number, seatsEach: number, seatsBandId?: string | null }
export type ArrangementFrom = 'performance' | 'run' | 'usual'
/** A run's choice, or a performance's own: a layout, or numbers. */
export interface Choice { layoutId: string | null, wheelchairSpaces: number | null, seatsPerSpace: number | null, seatsBandId?: string | null }

const fromLayout = (layout: SeatingLayout): Arrangement => ({ layout, spaces: layout.wheelchairSpaces, seatsEach: layout.seatsPerSpace })
interface ChoiceRow { layout_id: string | null, wheelchair_spaces: number | null, seats_per_space: number | null, seats_band_id: string | null }
const toChoice = (r: ChoiceRow): Choice => ({ layoutId: r.layout_id, wheelchairSpaces: r.wheelchair_spaces, seatsPerSpace: r.seats_per_space, seatsBandId: r.seats_band_id })

/** The run's choice for a production, or null when each space's usual layout is used. */
export async function runChoice(productionId: string): Promise<Choice | null> {
  const row = await first<ChoiceRow>('SELECT layout_id, wheelchair_spaces, seats_per_space, seats_band_id FROM box_office_run_layouts WHERE production_id = ?', productionId)
  return row ? toChoice(row) : null
}

/**
 * What a performance's wheelchair spaces come from: its own choice, else its run's (a layout counts
 * only at performances in its space), else its space's usual layout. `run` stands for the run's
 * choice while it is being changed; `ignoreOwn` hands a performance back to its run.
 */
export async function arrangementFor(performanceId: string, options: { run?: Choice | null, ignoreOwn?: boolean } = {}): Promise<{ arrangement: Arrangement | null, from: ArrangementFrom | null }> {
  const performance = await getPerformance(performanceId)
  const resolve = async (c: Choice | null): Promise<Arrangement | null> => {
    if (!c) return null
    if (c.layoutId) {
      const layout = await getLayout(c.layoutId)
      return layout && layout.spaceId === performance.spaceId ? fromLayout(layout) : null
    }
    return c.wheelchairSpaces === null ? null : { layout: null, spaces: c.wheelchairSpaces, seatsEach: c.seatsPerSpace ?? 0, seatsBandId: c.seatsBandId ?? null }
  }
  const own = options.ignoreOwn ? null : await first<ChoiceRow>('SELECT layout_id, wheelchair_spaces, seats_per_space, seats_band_id FROM box_office_performance_sales WHERE performance_id = ? AND layout_own = 1', performanceId)
  const mine = own ? await resolve(toChoice(own)) : null
  if (mine) return { arrangement: mine, from: 'performance' }
  const run = await resolve(options.run !== undefined ? options.run : await runChoice(performance.productionId))
  if (run) return { arrangement: run, from: 'run' }
  const usual = await usualLayout(performance.spaceId)
  return usual ? { arrangement: fromLayout(usual), from: 'usual' } : { arrangement: null, from: null }
}

/** The layout a performance uses, if a layout gives its spaces, and whether it is the performance's own choice. */
export async function layoutOf(performanceId: string): Promise<{ layout: SeatingLayout | null, chosen: boolean }> {
  const { arrangement, from } = await arrangementFor(performanceId)
  return { layout: arrangement?.layout ?? null, chosen: from === 'performance' }
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
 * The seating section of a production a wheelchair space's seats come from: the one chosen with the
 * numbers, or the one a layout names, by name. Null means the first seating section.
 */
async function seatsBandOf(productionId: string, arrangement: Arrangement): Promise<string | null> {
  const section = arrangement.layout ? arrangement.layout.seatsSection : null
  if (section) return (await first<{ id: string }>("SELECT id FROM box_office_bands WHERE production_id = ? AND kind = 'standard' AND lower(name) = lower(?)", productionId, section))?.id ?? null
  if (!arrangement.layout && arrangement.seatsBandId) return (await first<{ id: string }>("SELECT id FROM box_office_bands WHERE production_id = ? AND kind = 'standard' AND id = ?", productionId, arrangement.seatsBandId))?.id ?? null
  return null
}

/** Refuses a section that is not one of the production's seating sections. */
async function checkSection(productionId: string, bandId: string | null | undefined): Promise<void> {
  if (bandId && !(await first("SELECT 1 FROM box_office_bands WHERE production_id = ? AND kind = 'standard' AND id = ?", productionId, bandId)))
    refuse('box-office.band.not-found', 'That section is not one of this production\'s seating sections.', { status: 422, fields: { seatsBandId: 'Choose a section from the list.' } })
}

const bookedSpaces = async (performanceId: string) => (await first<{ claimed: number | null }>(
  'SELECT max(o.claimed) AS claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind = \'wheelchair\'', performanceId))?.claimed ?? 0

/**
 * Gives a performance its wheelchair spaces, in the caller's unit: its sales record names the layout
 * or the numbers, and whether they are its own, and the pool of its production's wheelchair band
 * holds the spaces. Refused while more spaces are booked than that. With `seats`, a performance sold
 * as one part of the house also takes the layout's seats as its capacity.
 */
export async function applyArrangement(unit: UnitView, performanceId: string, arrangement: Arrangement, options: { own?: boolean, seats?: boolean } = {}): Promise<void> {
  const performance = await getPerformance(performanceId)
  const { layout } = arrangement
  if (layout && performance.spaceId !== layout.spaceId) refuse('box-office.layout.other-space', 'That layout is for another space.', { status: 422, fields: { layoutId: 'Choose a layout of the space this performance is in.' } })
  const at = nowMs()
  const spaces = layout ? null : arrangement.spaces
  const each = layout ? null : arrangement.seatsEach
  const own = !!options.own
  const seatsBandId = await seatsBandOf(performance.productionId, arrangement)
  unit.add(sql`INSERT INTO box_office_performance_sales (id, performance_id, seating, state, layout_id, wheelchair_spaces, seats_per_space, layout_own, seats_band_id, created_at, updated_at)
    VALUES (${newId('sale')}, ${performanceId}, 'general', 'draft', ${layout?.id ?? null}, ${spaces}, ${each}, ${own}, ${seatsBandId}, ${at}, ${at})
    ON CONFLICT (performance_id) DO UPDATE SET layout_id = excluded.layout_id, wheelchair_spaces = excluded.wheelchair_spaces, seats_per_space = excluded.seats_per_space, layout_own = excluded.layout_own,
      seats_band_id = excluded.seats_band_id, updated_at = excluded.updated_at`)

  const existing = await first<{ band_id: string, claimed: number }>(
    'SELECT o.band_id, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind = \'wheelchair\' ORDER BY b.sort, b.name LIMIT 1', performanceId)
  if (arrangement.spaces > 0 || existing) {
    const bandId = existing?.band_id ?? await wheelchairBand(unit, performance.productionId)
    // The seats each space takes come from the production's first seating section, unless it names another.
    unit.add(sql`UPDATE box_office_bands SET displaces_band_id = (SELECT s.id FROM box_office_bands s WHERE s.production_id = ${performance.productionId} AND s.kind = 'standard' ORDER BY s.sort, s.name LIMIT 1), updated_at = ${at}
      WHERE id = ${bandId} AND displaces_band_id IS NULL AND EXISTS (SELECT 1 FROM box_office_bands s WHERE s.production_id = ${performance.productionId} AND s.kind = 'standard')`)
    unit.add(sql`INSERT INTO box_office_pools (id, performance_id, band_id, capacity, claimed, created_at, updated_at) VALUES (${newId('pool')}, ${performanceId}, ${bandId}, ${arrangement.spaces}, 0, ${at}, ${at})
      ON CONFLICT (performance_id, band_id) DO UPDATE SET capacity = excluded.capacity, updated_at = excluded.updated_at WHERE claimed <= excluded.capacity`)
      .expect(1, { code: 'box-office.layout.spaces-booked', reason: `${existing?.claimed ?? 'Some'} wheelchair spaces are already booked at this performance, more than the ${arrangement.spaces} ${layout ? layout.name : 'asked for'} has.`, remedy: 'Choose more wheelchair spaces, or move those bookings first.' })
  }

  if (options.seats && layout && layout.seats !== null) {
    const seating = await all<{ id: string, claimed: number }>(
      'SELECT o.id, o.claimed FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? AND b.kind <> \'wheelchair\'', performanceId)
    if (seating.length === 1) {
      unit.add(sql`UPDATE box_office_pools SET capacity = ${layout.seats}, updated_at = ${at} WHERE id = ${seating[0]!.id} AND claimed <= ${layout.seats}`)
        .expect(1, { code: 'box-office.layout.seats-sold', reason: `${seating[0]!.claimed} seats are already taken at this performance, more than the ${layout.seats} ${layout.name} has.` })
    }
  }
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: layout ? { layoutId: layout.id, own } : { wheelchairSpaces: arrangement.spaces, seatsPerSpace: arrangement.seatsEach, own } })
}

/**
 * Works out a performance's wheelchair spaces again and gives them to it. Only a performance set up
 * for sale, unless `create`. Strict, a change below the spaces booked is refused; otherwise such a
 * performance keeps what it has.
 */
export async function reapply(unit: UnitView, performanceId: string, options: { strict?: boolean, create?: boolean, run?: Choice | null, ignoreOwn?: boolean, seats?: boolean } = {}): Promise<void> {
  const sales = await first<ChoiceRow>('SELECT layout_id, wheelchair_spaces, seats_per_space, seats_band_id FROM box_office_performance_sales WHERE performance_id = ?', performanceId)
  if (!sales && !options.create) return
  const { arrangement, from } = await arrangementFor(performanceId, options)
  if (!arrangement) {
    if (sales) unit.add(sql`UPDATE box_office_performance_sales SET layout_id = NULL, wheelchair_spaces = NULL, seats_per_space = NULL, seats_band_id = NULL, layout_own = 0, updated_at = ${nowMs()}
      WHERE performance_id = ${performanceId} AND (layout_id IS NOT NULL OR wheelchair_spaces IS NOT NULL OR layout_own = 1)`)
    return
  }
  if (!options.strict && await bookedSpaces(performanceId) > arrangement.spaces) return
  await applyArrangement(unit, performanceId, arrangement, { own: from === 'performance', seats: options.seats })
}

/** Performances still to come, set up for sale: in a space, of a production, or using a layout. */
async function coming(where: { spaceId?: string, productionId?: string, layoutId?: string }): Promise<string[]> {
  return (await all<{ id: string }>(
    `SELECT f.id FROM core_performances f JOIN box_office_performance_sales s ON s.performance_id = f.id
      WHERE f.state IN ('draft', 'scheduled') AND s.state <> 'closed'
        AND (? IS NULL OR f.space_id = ?) AND (? IS NULL OR f.production_id = ?) AND (? IS NULL OR s.layout_id = ?) ORDER BY f.starts_at`,
    where.spaceId ?? null, where.spaceId ?? null, where.productionId ?? null, where.productionId ?? null, where.layoutId ?? null, where.layoutId ?? null)).map(r => r.id)
}

/**
 * Gives a space's new usual layout to its performances to come that take the usual one. It is not
 * stored until the unit runs, so it is given directly. One with more spaces booked keeps what it has.
 */
async function applyUsual(unit: UnitView, layout: SeatingLayout): Promise<void> {
  for (const performanceId of await coming({ spaceId: layout.spaceId })) {
    const { from } = await arrangementFor(performanceId)
    if ((from === null || from === 'usual') && await bookedSpaces(performanceId) <= layout.wheelchairSpaces) await applyArrangement(unit, performanceId, fromLayout(layout))
  }
}

export type ChoiceInput = z.output<typeof wheelchairChoice>

async function choiceOf(input: ChoiceInput): Promise<{ choice: Choice | null, layout: SeatingLayout | null }> {
  if (input.use === 'inherit') return { choice: null, layout: null }
  if (input.use === 'numbers') return { choice: { layoutId: null, wheelchairSpaces: input.wheelchairSpaces, seatsPerSpace: input.seatsPerSpace, seatsBandId: input.seatsBandId ?? null }, layout: null }
  const layout = await getLayout(input.layoutId)
  if (!layout) refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 422, fields: { layoutId: 'Choose a layout from the list.' } })
  return { choice: { layoutId: layout.id, wheelchairSpaces: null, seatsPerSpace: null }, layout }
}

/**
 * Sets a run's wheelchair spaces: a layout, used at its performances in that space, or numbers, used
 * at all of them, or (`inherit`) each space's usual layout. Performances with their own keep it.
 * Refused where a performance to come has more spaces booked than it would have.
 */
export async function setRunChoice(unit: UnitView, productionId: string, input: ChoiceInput): Promise<void> {
  const { choice } = await choiceOf(input)
  const at = nowMs()
  if (choice) {
    await checkSection(productionId, choice.seatsBandId)
    unit.add(sql`INSERT INTO box_office_run_layouts (id, production_id, layout_id, wheelchair_spaces, seats_per_space, seats_band_id, created_at, updated_at)
      VALUES (${newId('runl')}, ${productionId}, ${choice.layoutId}, ${choice.wheelchairSpaces}, ${choice.seatsPerSpace}, ${choice.seatsBandId ?? null}, ${at}, ${at})
      ON CONFLICT (production_id) DO UPDATE SET layout_id = excluded.layout_id, wheelchair_spaces = excluded.wheelchair_spaces, seats_per_space = excluded.seats_per_space, seats_band_id = excluded.seats_band_id, updated_at = excluded.updated_at`)
  }
  else unit.add(sql`DELETE FROM box_office_run_layouts WHERE production_id = ${productionId}`)
  for (const performanceId of await coming({ productionId })) await reapply(unit, performanceId, { strict: true, run: choice })
  unit.audit({ action: 'update', record: ['core.production', productionId], detail: choice ? { ...choice } : { wheelchair: 'usual' } })
}

/**
 * Sets one performance's wheelchair spaces, overriding its run's: a layout of its space, numbers of
 * its own, or (`inherit`) its run's again. Refused below the spaces booked.
 */
export async function setPerformanceChoice(unit: UnitView, performanceId: string, input: ChoiceInput): Promise<void> {
  const { choice, layout } = await choiceOf(input)
  if (!choice) return reapply(unit, performanceId, { strict: true, create: true, ignoreOwn: true })
  await checkSection((await getPerformance(performanceId)).productionId, choice.seatsBandId)
  const arrangement: Arrangement = layout ? fromLayout(layout) : { layout: null, spaces: choice.wheelchairSpaces!, seatsEach: choice.seatsPerSpace!, seatsBandId: choice.seatsBandId ?? null }
  await applyArrangement(unit, performanceId, arrangement, { own: true, seats: true })
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
  unit.add(sql`INSERT INTO box_office_seating_layouts (id, space_id, name, seats, wheelchair_spaces, seats_per_space, seats_section, usual, created_at, updated_at)
    SELECT ${id}, ${input.spaceId}, ${input.name}, ${input.seats}, ${input.wheelchairSpaces}, ${input.seatsPerSpace}, ${input.seatsSection ?? null}, ${isFirst}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_seating_layouts WHERE space_id = ${input.spaceId} AND lower(name) = lower(${input.name}))`).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: ['core.space', input.spaceId], detail: { layoutId: id } })
  if (isFirst) await applyUsual(unit, { id, ...input, seatsSection: input.seatsSection ?? null, usual: true })
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
  unit.add(sql`UPDATE box_office_seating_layouts SET name = ${input.name}, seats = ${input.seats}, wheelchair_spaces = ${input.wheelchairSpaces}, seats_per_space = ${input.seatsPerSpace}, seats_section = ${input.seatsSection ?? null}, updated_at = ${nowMs()}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM box_office_seating_layouts WHERE space_id = ${before.spaceId} AND lower(name) = lower(${input.name}) AND id <> ${id})`).expect(1, NAME_TAKEN)
  const after: SeatingLayout = { ...before, ...input, seatsSection: input.seatsSection ?? null }
  for (const performanceId of await coming({ layoutId: id })) {
    const { from } = await arrangementFor(performanceId)
    await applyArrangement(unit, performanceId, fromLayout(after), { own: from === 'performance' })
  }
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
  const using = await coming({ layoutId: id })
  if (using.length) refuse('box-office.layout.in-use', `${using.length === 1 ? 'A performance still to come uses' : `${using.length} performances still to come use`} this layout.`, { status: 409, remedy: 'Choose another layout for them first.', detail: { performanceId: using[0]! } })
  unit.add(sql`DELETE FROM box_office_seating_layouts WHERE id = ${id}`).expect(1, NOT_FOUND)
  // Performances that have taken place keep their record of it as a name no longer listed.
  unit.add(sql`UPDATE box_office_performance_sales SET layout_id = NULL WHERE layout_id = ${id}`)
  // A run that chose it goes back to each space's usual layout.
  unit.add(sql`DELETE FROM box_office_run_layouts WHERE layout_id = ${id}`)
  unit.audit({ action: 'delete', record: ['core.space', layout.spaceId], detail: { layoutId: id } })
}

/**
 * After a performance moves to another space: its own or its run's numbers still hold, a layout of
 * the old space gives way to the new space's usual one, or none. Spaces that cannot be given (more
 * booked than there would be) leave the performance as it was.
 */
export async function relayout(unit: UnitView, performanceId: string): Promise<void> {
  await reapply(unit, performanceId)
}

// ---------------------------------------------------------------------------------------------
// Wheelchair spaces at a performance, for taking claims and saying what is free

/**
 * A performance's wheelchair pool and what booking one space does: `units` seats taken from
 * `seatPoolId` (the section chosen, else the band's displaced one, else the first seating section),
 * and until `keepUntil` the seats of every unsold space kept back from ordinary sale.
 * With numbers typed in, each space takes the seats they say. Without either, a wheelchair band
 * takes seats only where it names a displaced band (the specification's set-up by hand).
 */
export interface Displacement {
  performanceId: string
  wheelchairPoolId: string
  seatPoolId: string | null
  units: number
  /** Until when seats are kept back now: null when nothing is, or staff let them go early. */
  keepUntil: number | null
  /** When staff let the kept seats go early, and until when they would otherwise have been kept. */
  releasedAt: number | null
  wouldKeepUntil: number | null
}

export async function displacementsFor(poolIds: string[]): Promise<Displacement[]> {
  if (!poolIds.length) return []
  const rows = await all<{ performance_id: string, wheelchair_pool: string, seat_pool: string | null, layout_id: string | null, seats_per_space: number | null, own_each: number | null, displaces_band_id: string | null, displaces_units: number, released_at: number | null }>(
    `SELECT w.performance_id, w.id AS wheelchair_pool, s.layout_id, l.seats_per_space, s.seats_per_space AS own_each, b.displaces_band_id, b.displaces_units, s.kept_released_at AS released_at,
        coalesce((SELECT p.id FROM box_office_pools p WHERE p.performance_id = w.performance_id AND p.band_id = s.seats_band_id),
          (SELECT p.id FROM box_office_pools p WHERE p.performance_id = w.performance_id AND p.band_id = b.displaces_band_id),
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
    const units = r.layout_id ? (r.seats_per_space ?? 0) : r.own_each !== null ? r.own_each : (r.displaces_band_id ? r.displaces_units : 0)
    const seatPoolId = units > 0 ? r.seat_pool : null
    const wouldKeepUntil = seatPoolId && keepFor > 0 ? starts.get(r.performance_id)! - keepFor : null
    return { performanceId: r.performance_id, wheelchairPoolId: r.wheelchair_pool, seatPoolId, units: seatPoolId ? units : 0, keepUntil: r.released_at === null ? wouldKeepUntil : null, releasedAt: r.released_at, wouldKeepUntil }
  })
}

// ---------------------------------------------------------------------------------------------
// Letting the kept seats go early

const NOTHING_KEPT = { code: 'box-office.layout.nothing-kept', reason: 'No seats are being kept back for wheelchair spaces at this performance now.' }

async function planOf(performanceId: string): Promise<Displacement | undefined> {
  const pools = await all<{ id: string }>('SELECT id FROM box_office_pools WHERE performance_id = ?', performanceId)
  return (await displacementsFor(pools.map(p => p.id))).find(d => d.performanceId === performanceId)
}

/**
 * Puts the seats kept back for unbooked wheelchair spaces on general sale now, before the keep-back
 * time: for a house that knows no one else needs a space tonight. Audited, with who did it.
 */
export async function releaseKept(unit: UnitView, performanceId: string, accountId: string | null): Promise<void> {
  const plan = await planOf(performanceId)
  const at = nowMs()
  if (!plan || plan.keepUntil === null || at >= plan.keepUntil) refuse(NOTHING_KEPT.code, NOTHING_KEPT.reason, { status: 409 })
  unit.add(sql`UPDATE box_office_performance_sales SET kept_released_at = ${at}, kept_released_by = ${accountId}, updated_at = ${at} WHERE performance_id = ${performanceId} AND kept_released_at IS NULL`).expect(1, NOTHING_KEPT)
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: { keptSeats: 'released' } })
}

/**
 * Undoes an early release: the seats of the spaces still unbooked are kept back again until the
 * keep-back time. Seats sold in between stay sold; only what is still free is kept.
 */
export async function keepAgain(unit: UnitView, performanceId: string): Promise<void> {
  const plan = await planOf(performanceId)
  const at = nowMs()
  if (!plan || plan.releasedAt === null) refuse('box-office.layout.not-released', 'The kept seats at this performance have not been let go early.', { status: 409 })
  if (plan.wouldKeepUntil === null || at >= plan.wouldKeepUntil) refuse('box-office.layout.keep-over', 'The keep-back time has passed, so these seats are on general sale anyway.', { status: 409 })
  const spaces = await first<{ free: number }>('SELECT capacity - claimed AS free FROM box_office_pools WHERE id = ?', plan.wheelchairPoolId)
  if (!spaces?.free) refuse('box-office.layout.all-booked', 'Every wheelchair space is booked, so there are no seats to keep back.', { status: 409 })
  unit.add(sql`UPDATE box_office_performance_sales SET kept_released_at = NULL, kept_released_by = NULL, updated_at = ${at} WHERE performance_id = ${performanceId} AND kept_released_at IS NOT NULL`)
    .expect(1, { code: 'box-office.layout.not-released', reason: 'The kept seats at this performance have not been let go early.' })
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: { keptSeats: 'kept' } })
}
