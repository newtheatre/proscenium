// Setting a whole run up for sale rather than one night at a time (box office review S1 and S2; show
// walkthrough, decisions 2 and 3), until the production's Tickets tab holds the run's set-up itself.
//
// A performance that is scheduled with nothing set up takes the run's set-up: the seats and limits
// of the production's earliest performance that has been set up, or, for a production's first, the
// ticket preset of its space (else the theatre's usual one): its sections become the production's
// sections, its prices the production's, and its seats this performance's. A date added to a run
// already on sale then goes on sale too, unless the theatre has turned that off.
import { all, can, createUnit, first, refuse, useContext, useSetting, type Actor, type UnitView } from '#kit'
import { getPerformance, listPerformances } from '#modules/core'
import { copySetup } from './copy'
import { houseOf } from './layouts'
import { priceLayers, setPrices, type PriceInput } from './prices'
import { checklist, createBand, listBands, openSales, poolsOf, salesOf, saveSales } from './setup'
import { presetFor, type TicketPreset } from './ticket-presets'

/** The seats a performance's pools sell: wheelchair spaces are counted apart. */
const seatsOf = (pools: { bandKind: string, capacity: number }[]) => pools.filter(p => p.bandKind !== 'wheelchair').reduce((sum, p) => sum + p.capacity, 0)

/** What a lone, unnamed section of a preset is called once it is a production's section. */
const WHOLE_HOUSE = 'All seats'

/** The production's earliest performance, other than this one, with seats to sell. */
async function setUpSibling(productionId: string, performanceId: string): Promise<string | null> {
  const row = await first<{ id: string }>(
    `SELECT f.id FROM core_performances f WHERE f.production_id = ? AND f.id <> ? AND f.state IN ('scheduled', 'completed')
      AND EXISTS (SELECT 1 FROM box_office_pools o WHERE o.performance_id = f.id AND o.capacity > 0) ORDER BY f.starts_at, f.id LIMIT 1`, productionId, performanceId)
  return row?.id ?? null
}

/** Whether a preset holds anything to start from: a price, or a number of seats. */
const useful = (preset: TicketPreset) => preset.sections.some(s => s.prices.length > 0 || s.seats !== null)

/**
 * Gives a production a preset's sections and prices where it has none, and this performance the
 * preset's seats. A section with no seat count takes the rest of the house. Says whether it did.
 */
async function applyPreset(performanceId: string, preset: TicketPreset): Promise<boolean> {
  const performance = await getPerformance(performanceId)
  const productionId = performance.productionId
  let bands = await listBands(productionId)
  if (!bands.length) {
    const made = createUnit()
    for (const [i, s] of preset.sections.entries()) createBand(made.view(), productionId, { name: s.name ?? WHOLE_HOUSE, kind: 'standard', sort: i })
    await made.commit()
    bands = await listBands(productionId)
  }
  // Each section is matched to the production's section of the same name; a lone unnamed section
  // to a production with one section.
  const bandOf = (name: string | null) => name === null
    ? (bands.length === 1 ? bands[0] : bands.find(b => b.name === WHOLE_HOUSE))
    : bands.find(b => b.name.toLowerCase() === name.toLowerCase())

  const unit = createUnit()
  const layers = await priceLayers(productionId, performanceId)
  const prices: PriceInput[] = []
  for (const s of preset.sections) {
    const band = bandOf(s.name)
    if (!band) continue
    for (const p of s.prices) {
      const layer = layers.find(l => l.bandId === band.id && l.ticketTypeId === p.ticketTypeId)
      if (!layer || layer.production === null) prices.push({ bandId: band.id, ticketTypeId: p.ticketTypeId, performanceId: null, amountMinor: p.amountMinor })
    }
  }
  if (prices.length) setPrices(unit.view(), productionId, await useSetting('core.locale.currency') as string, prices, null)

  const house = await houseOf(performanceId)
  const counted = preset.sections.reduce((sum, s) => sum + (s.seats ?? 0), 0)
  const pools = preset.sections.flatMap((s) => {
    const band = bandOf(s.name)
    const seats = s.seats ?? (house === null ? null : house - counted)
    return band && seats !== null && seats > 0 ? [{ bandId: band.id, capacity: seats }] : []
  })
  const total = pools.reduce((sum, p) => sum + p.capacity, 0)
  // A preset is never a reason to sell more than the space holds: that stays a person's decision.
  if (pools.length && (house === null || total <= house)) await saveSales(unit.view(), performanceId, { pools }, useContext().actor)
  if (!prices.length && !pools.length) return false
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: { presetId: preset.id, prices: prices.length, pools: pools.length } })
  await unit.commit()
  return true
}

/**
 * Sets a newly scheduled performance up from the rest of its run or from its preset, in units of its
 * own, then puts it on sale in the caller's unit if the run is on sale and nothing is missing.
 */
export async function setUpFromRun(unit: UnitView, performanceId: string): Promise<'copied' | 'preset' | 'none'> {
  const performance = await getPerformance(performanceId)
  if (performance.state !== 'scheduled') return 'none'
  let how: 'copied' | 'preset' | 'none' = 'none'
  if (!(await poolsOf(performanceId)).length) {
    const sibling = await setUpSibling(performance.productionId, performanceId)
    if (sibling) {
      const pools = await poolsOf(sibling)
      const house = await houseOf(performanceId)
      if (house === null || seatsOf(pools) <= house) {
        const copying = createUnit()
        await copySetup(copying.view(), performanceId, sibling, useContext().actor)
        await copying.commit()
        how = 'copied'
      }
    }
    else {
      const preset = await presetFor(performance.spaceId)
      if (preset && useful(preset) && await applyPreset(performanceId, preset)) how = 'preset'
    }
  }
  await openWithRun(unit, performance.productionId, performanceId)
  return how
}

/** Puts a performance on sale when another of its run is on sale, the setting allows it and nothing is missing. */
async function openWithRun(unit: UnitView, productionId: string, performanceId: string): Promise<void> {
  if (!await useSetting('box-office.runs.open-new-dates')) return
  if ((await salesOf(performanceId))?.state === 'on_sale') return
  const runOnSale = await first(`SELECT 1 FROM box_office_performance_sales s JOIN core_performances f ON f.id = s.performance_id
    WHERE f.production_id = ? AND f.id <> ? AND s.state = 'on_sale'`, productionId, performanceId)
  if (!runOnSale) return
  if ((await checklist(performanceId)).items.every(i => i.done)) await openSales(unit, performanceId)
}

export interface RunResult { done: number, skipped: { performanceId: string, reason: string }[] }

/** The production's performances still to sell: scheduled, or drafts, never cancelled or played. */
async function runOf(productionId: string) {
  return (await listPerformances({ productionId })).filter(p => p.state === 'scheduled' || p.state === 'draft')
}

/**
 * Copies one performance's set-up to every other performance of its production that has nothing set
 * up yet (S2). Performances already set up keep theirs. Said per performance, so one that cannot be
 * copied to (more seats than its space holds) is named rather than stopping the rest.
 */
export async function copyToRun(unit: UnitView, sourcePerformanceId: string, actor: Actor, options: { confirmOverVenue?: boolean } = {}): Promise<RunResult> {
  const source = await getPerformance(sourcePerformanceId)
  if (!(await poolsOf(source.id)).length) refuse('box-office.copy.nothing', 'This performance has not been set up for sale, so there is nothing to copy.', { status: 422 })
  const result: RunResult = { done: 0, skipped: [] }
  const capacity = seatsOf(await poolsOf(source.id))
  for (const target of await runOf(source.productionId)) {
    if (target.id === source.id || (await poolsOf(target.id)).length) continue
    if (!(await can(actor, 'box-office.performance.manage', ['core.performance', target.id])).allowed) continue
    const house = await houseOf(target.id)
    if (house !== null && capacity > house && !options.confirmOverVenue) {
      result.skipped.push({ performanceId: target.id, reason: `The space holds ${house}, fewer than the ${capacity} seats being copied.` })
      continue
    }
    await copySetup(unit, target.id, source.id, actor, options)
    result.done++
  }
  return result
}

/** Puts every performance of a production that is ready on sale (S2), naming those that are not. */
export async function openRun(unit: UnitView, productionId: string, actor: Actor): Promise<RunResult> {
  const result: RunResult = { done: 0, skipped: [] }
  const performances = await runOf(productionId)
  const states = new Map((await all<{ performance_id: string, state: string }>(
    'SELECT performance_id, state FROM box_office_performance_sales WHERE performance_id IN (SELECT value FROM json_each(?))', JSON.stringify(performances.map(p => p.id)))).map(s => [s.performance_id, s.state]))
  for (const p of performances) {
    const state = states.get(p.id)
    if (state === 'on_sale' || state === 'closed') continue
    if (!(await can(actor, 'box-office.performance.manage', ['core.performance', p.id])).allowed) continue
    const missing = state ? (await checklist(p.id)).items.find(i => !i.done) : { code: 'capacity' }
    if (missing) {
      result.skipped.push({ performanceId: p.id, reason: missing.code })
      continue
    }
    await openSales(unit, p.id)
    result.done++
  }
  return result
}

/**
 * The run's seats, as the Tickets tab shows them: the seats per section most of the run's
 * performances have, and those whose seats differ, which have their own (a per-night override).
 * A performance with nothing set up follows the run.
 */
export function runSeats(performances: { id: string, pools: { band_id: string, capacity: number }[] }[]): { seats: Record<string, number>, own: Set<string> } {
  const key = (pools: { band_id: string, capacity: number }[]) => JSON.stringify([...pools].sort((a, b) => a.band_id.localeCompare(b.band_id)).map(p => [p.band_id, p.capacity]))
  const counts = new Map<string, { n: number, pools: { band_id: string, capacity: number }[] }>()
  for (const p of performances) {
    if (!p.pools.length) continue
    const k = key(p.pools)
    counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, pools: p.pools })
  }
  const usual = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0]
  if (!usual) return { seats: {}, own: new Set() }
  return {
    seats: Object.fromEntries(usual[1].pools.map(p => [p.band_id, p.capacity])),
    own: new Set(performances.filter(p => p.pools.length && key(p.pools) !== usual[0]).map(p => p.id)),
  }
}

/** The run's seats and the nights with seats of their own, read for one production. */
export async function runSeatsOf(productionId: string): Promise<{ seats: Record<string, number>, own: Set<string> }> {
  const rows = await all<{ performance_id: string, band_id: string, capacity: number }>(
    `SELECT o.performance_id, o.band_id, o.capacity FROM box_office_pools o JOIN core_performances f ON f.id = o.performance_id
      WHERE f.production_id = ? AND f.state IN ('scheduled', 'draft') AND o.band_id NOT IN (SELECT id FROM box_office_bands WHERE kind = 'wheelchair')`, productionId)
  const by = new Map<string, { band_id: string, capacity: number }[]>()
  for (const r of rows) by.set(r.performance_id, [...(by.get(r.performance_id) ?? []), r])
  return runSeats([...by.entries()].map(([id, pools]) => ({ id, pools })))
}

/**
 * Sets the seats of every performance of the run that follows the run (or of those named), in one
 * go (the Tickets tab). A performance with seats of its own keeps them unless named; one that has
 * sold more than its new count in a section is left as it is and named.
 */
export async function setRunSeats(unit: UnitView, productionId: string, input: { pools: { bandId: string, capacity: number }[], performanceIds?: string[], confirmOverVenue?: boolean }, actor: Actor): Promise<RunResult & { performanceIds: string[] }> {
  const performances = await runOf(productionId)
  const pools = await all<{ performance_id: string, band_id: string, capacity: number, claimed: number }>(
    'SELECT performance_id, band_id, capacity, claimed FROM box_office_pools WHERE performance_id IN (SELECT value FROM json_each(?))', JSON.stringify(performances.map(p => p.id)))
  const of = (id: string) => pools.filter(o => o.performance_id === id)
  const { own } = runSeats(performances.map(p => ({ id: p.id, pools: of(p.id) })))
  const wanted = input.performanceIds ? new Set(input.performanceIds) : null
  const result: RunResult & { performanceIds: string[] } = { done: 0, skipped: [], performanceIds: [] }
  for (const p of performances) {
    if (wanted ? !wanted.has(p.id) : own.has(p.id)) continue
    if (!(await can(actor, 'box-office.performance.manage', ['core.performance', p.id])).allowed) continue
    const short = input.pools.find(w => (of(p.id).find(o => o.band_id === w.bandId)?.claimed ?? 0) > w.capacity)
    if (short) {
      result.skipped.push({ performanceId: p.id, reason: 'below-claimed' })
      continue
    }
    const house = await houseOf(p.id)
    if (house !== null && input.pools.reduce((sum, w) => sum + w.capacity, 0) > house && !input.confirmOverVenue) {
      result.skipped.push({ performanceId: p.id, reason: 'over-venue' })
      continue
    }
    await saveSales(unit, p.id, { pools: input.pools, confirmOverVenue: input.confirmOverVenue }, actor)
    result.done++
    result.performanceIds.push(p.id)
  }
  return result
}
