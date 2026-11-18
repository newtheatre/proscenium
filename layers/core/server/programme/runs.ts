// Runs of performances (C-04). A pattern (first and last date, days of the week, times) is planned
// first: every performance it would make, each marked if it is in the past, clashes with a
// scheduled performance or another of the run, or falls in a blocking closure. The person keeps
// what they accept, and that list is saved. Within the kit's limit on rows in one unit it is saved
// whole or not at all, in one statement whose guards are predicates on the insert. A longer list
// becomes a run, which the core.create-run job saves in chunks, each its own unit and safe to
// repeat. A run that stops part way can be finished or removed.
import { sql, type SQL } from 'drizzle-orm'
import { all, createUnit, first, isRefusal, newId, nowMs, refuse, TIME_ZONE_REMEDY, useSetting } from '#kit'
import type { UnitView } from '#kit'
import { instantOfLocal } from '#kit/clock'
import { assertNoBlockingClosure, closuresBetween } from '../places/closures'
import { dayRule, operatingDayAt, type DayRule } from '../calendar'
import { firstRefusal, noClash, performanceDefaults, spaceFits, syncProductionDates, turnaroundMs, whyNotFree } from './performances'

export interface RunPattern {
  venueId: string
  spaceId: string
  /** The first and last local dates, YYYY-MM-DD. */
  from: string
  to: string
  /** Each start time with the days it runs on (run presets). */
  slots?: RunSlot[]
  /** ISO weekdays: 1 is Monday, 7 is Sunday. One list for every time, as before slots. */
  days?: number[]
  /** Local start times, HH:mm. */
  times?: string[]
  /** How long each lasts, intervals included; left out, the production's running time or the setting. */
  minutes?: number | null
  /** How many minutes before each start the doors open; left out, the production's, space's or setting. */
  doorsBeforeMinutes?: number | null
}

/** Local start times, HH:mm, on ISO weekdays (1 is Monday, 7 is Sunday). */
export interface RunSlot { days: number[], times: string[] }

export type Problem = 'past' | 'clash' | 'closed'
export interface PlannedPerformance { startsAt: number, endsAt: number, doorsAt: number | null, operatingDay: string, problem: Problem | null, reason: string | null }

export interface RunItem { startsAt: number, endsAt: number, doorsAt: number | null }
export interface RunInput {
  venueId: string
  spaceId: string
  scheduled: boolean
  capacity?: number | null
  intervalCount?: number | null
  intervalMinutes?: number | null
  label?: string | null
  externalBookingUrl?: string | null
  performances: RunItem[]
}

export interface RunStatus { id: string, total: number, done: number, state: 'running' | 'stopped' | 'done' | 'removing' | 'removed', stopReason: string | null, scheduled: boolean }

interface RunRow {
  id: string
  production_id: string
  venue_id: string
  space_id: string
  scheduled: number
  capacity: number | null
  interval_count: number | null
  interval_minutes: number | null
  label: string | null
  external_booking_url: string | null
  items: string
  total: number
  done: number
  state: RunStatus['state']
  stop_reason: string | null
}

const DAY = 86_400_000 // not-policy: milliseconds in a day
const MINUTE = 60_000 // not-policy: milliseconds in a minute
const LONGEST = 400 // not-policy: a run spans at most a little over a year of dates
const CHANGED = { code: 'core.run.changed', reason: 'A performance in the run now clashes or falls in a closure, or the space changed.', remedy: 'Check the dates again, then add the run.' }

const rows = async () => await useSetting('core.units.set-rows-limit') as number
const toStatus = (r: RunRow): RunStatus => ({ id: r.id, total: r.total, done: r.done, state: r.state, stopReason: r.stop_reason, scheduled: !!r.scheduled })

async function rule(): Promise<DayRule> {
  return await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet.', { status: 409, remedy: TIME_ZONE_REMEDY })
}

function* dates(from: string, to: string): Generator<{ date: string, weekday: number }> {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!(end >= start)) refuse('core.run.dates', 'The last date must be on or after the first.', { status: 422, fields: { to: 'The last date must be on or after the first.' } })
  if ((end - start) / DAY > LONGEST) refuse('core.run.too-long', `A run can span at most ${LONGEST} days.`, { status: 422, fields: { to: 'Choose a nearer last date.' } })
  for (let at = start; at <= end; at += DAY) {
    const d = new Date(at)
    yield { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() || 7 } // not-policy: Sunday is 7, ISO style
  }
}

/** The performances a pattern would make, each marked with what stands in its way. */
export async function planRun(productionId: string, pattern: RunPattern): Promise<{ performances: PlannedPerformance[], limit: number }> {
  const production = await first<{ state: string }>('SELECT state FROM core_productions WHERE id = ?', productionId)
  if (!production) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  const space = await first<{ exclusive: number }>("SELECT exclusive FROM core_spaces WHERE id = ? AND venue_id = ? AND performable = 1 AND state = 'active'", pattern.spaceId, pattern.venueId)
  if (!space) refuse('core.performance.space-unsuitable', 'Choose a space in that venue that is in use and can hold performances.', { status: 409 })
  const day = await rule()
  const defaults = await performanceDefaults(productionId, pattern.spaceId)
  const minutes = pattern.minutes ?? defaults.runningMinutes
  const doors = (pattern.doorsBeforeMinutes ?? defaults.doorsBeforeMinutes) * MINUTE
  const gap = await turnaroundMs()
  // The times each weekday has, from every slot that names it.
  const slots = pattern.slots ?? [{ days: pattern.days ?? [], times: pattern.times ?? [] }]
  const byDay = new Map<number, Set<string>>()
  for (const slot of slots) for (const d of slot.days) for (const time of slot.times) byDay.set(d, (byDay.get(d) ?? new Set()).add(time))

  const planned: PlannedPerformance[] = []
  for (const { date, weekday } of dates(pattern.from, pattern.to)) {
    for (const time of [...byDay.get(weekday) ?? []].sort()) {
      const startsAt = instantOfLocal(date, time, day.timeZone)
      planned.push({ startsAt, endsAt: startsAt + minutes * MINUTE, doorsAt: startsAt - doors, operatingDay: operatingDayAt(startsAt, day), problem: null, reason: null })
    }
  }
  if (!planned.length) return { performances: [], limit: await rows() }

  // One read of what is already there, then every candidate is checked in memory.
  const from = planned[0]!.startsAt
  const to = Math.max(...planned.map(p => p.endsAt))
  const taken = space.exclusive
    ? await all<{ title: string, starts_at: number, ends_at: number }>(`SELECT p.title, o.starts_at, o.ends_at FROM core_performances o JOIN core_productions p ON p.id = o.production_id
        WHERE o.space_id = ? AND o.state = 'scheduled' AND o.starts_at < ? AND o.ends_at > ?`, pattern.spaceId, to + gap, from - gap)
    : []
  const closures = (await closuresBetween(from, to, { spaceId: pattern.spaceId })).filter(c => c.blocksPerformances)
  const at = nowMs()
  planned.forEach((p, i) => {
    const overlaps = (s: number, e: number, turnaround = 0) => s < p.endsAt + turnaround && e + turnaround > p.startsAt
    const clash = taken.find(t => overlaps(t.starts_at, t.ends_at, gap))
    const closure = closures.find(c => overlaps(c.startsAt, c.endsAt))
    const sibling = space.exclusive && planned.slice(0, i).some(o => !o.problem && overlaps(o.startsAt, o.endsAt, gap))
    if (p.startsAt <= at) Object.assign(p, { problem: 'past', reason: 'This time has passed.' })
    else if (clash) Object.assign(p, { problem: 'clash', reason: `${clash.title} is already scheduled in this space then.` })
    else if (sibling) Object.assign(p, { problem: 'clash', reason: 'Another performance of this run is in the space then.' })
    else if (closure) Object.assign(p, { problem: 'closed', reason: `The space is closed then: ${closure.title}.` })
  })
  return { performances: planned, limit: await rows() }
}

function checkItems(items: RunItem[]) {
  const at = nowMs()
  if (new Set(items.map(i => i.startsAt)).size !== items.length) refuse('core.run.repeated', 'The run has two performances at the same time.', { status: 422 })
  for (const i of items) {
    if (i.endsAt <= i.startsAt) refuse('core.performance.times', 'A performance must end after it starts.', { status: 422 })
    if (i.doorsAt !== null && i.doorsAt > i.startsAt) refuse('core.performance.doors', 'Doors must open at or before the start.', { status: 422 })
    if (i.startsAt <= at) refuse('core.performance.started', 'A run cannot add a performance whose time has passed.', { status: 409 })
  }
}

/**
 * Inserts the items in one statement, each guarded as scheduling guards it, and expects every one
 * to go in. With a run id, an item the run already made is left alone, so a chunk can repeat.
 * Returns the new performances' ids.
 */
function insertItems(unit: UnitView, productionId: string, input: Omit<RunInput, 'performances'>, items: RunItem[], day: DayRule, runId: string | null, gap: number): string[] {
  const made = items.map(i => ({ id: newId('perf'), s: i.startsAt, e: i.endsAt, d: i.doorsAt, o: operatingDayAt(i.startsAt, day) }))
  const s = sql`json_extract(r.value, '$.s')`
  const e = sql`json_extract(r.value, '$.e')`
  const guards: SQL[] = [spaceFits(input.venueId, input.spaceId), sql`EXISTS (SELECT 1 FROM core_productions WHERE id = ${productionId} AND state <> 'cancelled')`]
  if (input.scheduled) guards.push(noClash(input.spaceId, s, e, null, gap), assertNoBlockingClosure(input.spaceId, s, e))
  if (runId) guards.push(sql`NOT EXISTS (SELECT 1 FROM core_performances x WHERE x.run_id = ${runId} AND x.starts_at = ${s})`)
  unit.add(sql`INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, doors_at, ends_at, operating_day, interval_count, interval_minutes, capacity, label, external_booking_url, state, run_id, created_at)
    SELECT json_extract(r.value, '$.id'), ${productionId}, ${input.venueId}, ${input.spaceId}, ${s}, json_extract(r.value, '$.d'), ${e}, json_extract(r.value, '$.o'),
      ${input.intervalCount ?? null}, ${input.intervalMinutes ?? null}, ${input.capacity ?? null}, ${input.label ?? null}, ${input.externalBookingUrl ?? null}, ${input.scheduled ? 'scheduled' : 'draft'}, ${runId}, ${nowMs()}
    FROM json_each(${JSON.stringify(made)}) r
    WHERE ${sql.join(guards, sql` AND `)}`)
  return made.map(m => m.id)
}

function announceScheduled(unit: UnitView, productionId: string, ids: string[]) {
  unit.announce('core.performance.scheduled', ids.map(id => ({ payload: { performanceId: id, productionId, reinstated: false }, record: ['core.performance', id] as const })))
}

/**
 * C-04: saves the performances the person accepted. Within the limit, in the caller's unit, whole or
 * not at all. Over it, a run for the job, whose progress the console follows.
 */
export async function createRun(unit: UnitView, productionId: string, input: RunInput): Promise<{ created: number } | { run: RunStatus }> {
  const items = [...input.performances].sort((a, b) => a.startsAt - b.startsAt)
  checkItems(items)
  const day = await rule()
  const limit = await rows()
  if (items.length <= limit) {
    const ids = insertItems(unit, productionId, input, items, day, null, await turnaroundMs())
    unit.expect(items.length, CHANGED)
    if (input.scheduled) {
      syncProductionDates(unit, productionId)
      announceScheduled(unit, productionId, ids)
    }
    unit.audit({ action: 'create', record: ['core.production', productionId], detail: { performances: items.length, scheduled: input.scheduled } })
    return { created: items.length }
  }
  const id = newId('run')
  const at = nowMs()
  unit.add(sql`INSERT INTO core_performance_runs (id, production_id, venue_id, space_id, scheduled, capacity, interval_count, interval_minutes, label, external_booking_url, items, total, done, state, created_at, updated_at)
    SELECT ${id}, ${productionId}, ${input.venueId}, ${input.spaceId}, ${input.scheduled ? 1 : 0}, ${input.capacity ?? null}, ${input.intervalCount ?? null}, ${input.intervalMinutes ?? null}, ${input.label ?? null}, ${input.externalBookingUrl ?? null},
      ${JSON.stringify(items)}, ${items.length}, 0, 'running', ${at}, ${at}
    WHERE ${spaceFits(input.venueId, input.spaceId)}`).expect(1, { code: 'core.performance.space-unsuitable', reason: 'Choose a space in that venue that is in use and can hold performances.' })
  unit.audit({ action: 'create', record: ['core.production', productionId], detail: { run: id, performances: items.length, scheduled: input.scheduled } })
  unit.enqueue('core.create-run', { runId: id }, { dedupeKey: `${id}:0` })
  return { run: { id, total: items.length, done: 0, state: 'running', stopReason: null, scheduled: input.scheduled } }
}

async function runRow(productionId: string, runId: string): Promise<RunRow> {
  const row = await first<RunRow>('SELECT * FROM core_performance_runs WHERE id = ? AND production_id = ?', runId, productionId)
  if (!row) refuse('core.run.not-found', 'There is no such run.', { status: 404 })
  return row
}

export async function getRun(productionId: string, runId: string): Promise<RunStatus> {
  return toStatus(await runRow(productionId, runId))
}

/** Runs not yet finished or removed, for the console to show and offer to finish or remove. */
export async function openRuns(productionId: string): Promise<RunStatus[]> {
  return (await all<RunRow>("SELECT * FROM core_performance_runs WHERE production_id = ? AND state IN ('running', 'stopped', 'removing') ORDER BY created_at, id", productionId)).map(toStatus)
}

/** Picks a stopped run up where it stopped. */
export async function finishRun(unit: UnitView, productionId: string, runId: string): Promise<RunStatus> {
  const row = await runRow(productionId, runId)
  if (row.state !== 'stopped') refuse('core.run.not-stopped', 'Only a run that stopped part way can be finished.', { status: 409 })
  unit.add(sql`UPDATE core_performance_runs SET state = 'running', stop_reason = NULL, updated_at = ${nowMs()} WHERE id = ${runId} AND state = 'stopped'`).expect(1, CHANGED)
  unit.enqueue('core.create-run', { runId }, { dedupeKey: `${runId}:${row.done}:finish:${nowMs()}` })
  return { ...toStatus(row), state: 'running', stopReason: null }
}

/**
 * Removes what a stopped run made: drafts are deleted, and scheduled performances are cancelled
 * with the reason "other", in chunks, by the same job. A module's refusal to cancel stops it again.
 */
export async function removeRun(unit: UnitView, productionId: string, runId: string): Promise<RunStatus> {
  const row = await runRow(productionId, runId)
  if (row.state !== 'stopped') refuse('core.run.not-stopped', 'Only a run that stopped part way can be removed.', { status: 409 })
  unit.add(sql`UPDATE core_performance_runs SET state = 'removing', updated_at = ${nowMs()} WHERE id = ${runId} AND state = 'stopped'`).expect(1, CHANGED)
  unit.enqueue('core.create-run', { runId }, { dedupeKey: `${runId}:remove` })
  return { ...toStatus(row), state: 'removing' }
}

/** The job's work: one chunk of a run, made or removed, then the next chunk queued. */
export async function runChunk(unit: UnitView, runId: string): Promise<void> {
  const row = await first<RunRow>('SELECT * FROM core_performance_runs WHERE id = ?', runId)
  if (!row) return
  if (row.state === 'running') return makeChunk(unit, row)
  if (row.state === 'removing') return removeChunk(unit, row)
}

async function makeChunk(unit: UnitView, row: RunRow): Promise<void> {
  const limit = await rows()
  const items = (JSON.parse(row.items) as RunItem[]).slice(row.done, row.done + limit)
  const next = row.done + items.length
  const input = { venueId: row.venue_id, spaceId: row.space_id, scheduled: !!row.scheduled, capacity: row.capacity, intervalCount: row.interval_count, intervalMinutes: row.interval_minutes, label: row.label, externalBookingUrl: row.external_booking_url }

  // The chunk is its own unit, so a refusal can still be recorded in the job's.
  const chunk = createUnit()
  const ids = items.length ? insertItems(chunk, row.production_id, input, items, await rule(), row.id, await turnaroundMs()) : []
  const starts = JSON.stringify(items.map(i => i.startsAt))
  chunk.add(sql`UPDATE core_performance_runs SET done = ${next}, state = ${next >= row.total ? 'done' : 'running'}, updated_at = ${nowMs()}
    WHERE id = ${row.id} AND state = 'running' AND done = ${row.done}
      AND (SELECT count(*) FROM core_performances WHERE run_id = ${row.id} AND starts_at IN (SELECT value FROM json_each(${starts}))) = ${items.length}`).expect(1, CHANGED)
  if (input.scheduled && ids.length) {
    syncProductionDates(chunk, row.production_id)
    // A repeated chunk inserts nothing, and its update finds done moved on, so it never commits.
    announceScheduled(chunk, row.production_id, ids)
  }
  if (next < row.total) chunk.enqueue('core.create-run', { runId: row.id }, { dedupeKey: `${row.id}:${next}` })
  try {
    await chunk.commit()
  }
  catch (error) {
    if (!isRefusal(error) || error.code !== CHANGED.code) throw error
    const now = await first<{ done: number, state: string }>('SELECT done, state FROM core_performance_runs WHERE id = ?', row.id)
    if (!now || now.done !== row.done || now.state !== 'running') return // another delivery made this chunk
    const why = await firstProblem(row, items)
    unit.add(sql`UPDATE core_performance_runs SET state = 'stopped', stop_reason = ${why}, updated_at = ${nowMs()} WHERE id = ${row.id} AND state = 'running' AND done = ${row.done}`)
  }
}

async function firstProblem(row: RunRow, items: RunItem[]): Promise<string> {
  const fits = await first<{ ok: number }>("SELECT 1 AS ok FROM core_spaces WHERE id = ? AND venue_id = ? AND performable = 1 AND state = 'active'", row.space_id, row.venue_id)
  if (!fits) return 'The space can no longer hold performances.'
  const production = await first<{ state: string }>('SELECT state FROM core_productions WHERE id = ?', row.production_id)
  if (production?.state === 'cancelled') return 'The production was cancelled.'
  if (row.scheduled) {
    for (const i of items) {
      const why = await whyNotFree(row.space_id, i.startsAt, i.endsAt, null)
      if (why) return `${new Date(i.startsAt).toISOString().slice(0, 10)}: ${why.reason}`
    }
  }
  return 'A performance in this part of the run could not be added.'
}

async function removeChunk(unit: UnitView, row: RunRow): Promise<void> {
  const limit = await rows()
  const drafts = await all<{ id: string }>("SELECT id FROM core_performances WHERE run_id = ? AND state = 'draft' ORDER BY starts_at LIMIT ?", row.id, limit)
  if (drafts.length) {
    unit.add(sql`DELETE FROM core_performances WHERE state = 'draft' AND run_id = ${row.id} AND id IN (SELECT value FROM json_each(${JSON.stringify(drafts.map(d => d.id))}))`)
  }
  const scheduled = drafts.length < limit
    ? await all<{ id: string }>("SELECT id FROM core_performances WHERE run_id = ? AND state = 'scheduled' ORDER BY starts_at LIMIT ?", row.id, limit - drafts.length)
    : []
  // Any module may refuse a cancel (part 3): the first refusal stops the removal, with its reason.
  for (const p of scheduled) {
    const refused = await firstRefusal({ record: { type: 'core.performance', id: p.id }, kind: 'cancel' }, { kind: 'job' })
    if (refused) {
      unit.add(sql`UPDATE core_performance_runs SET state = 'stopped', stop_reason = ${refused.reason.slice(0, 300)}, updated_at = ${nowMs()} WHERE id = ${row.id} AND state = 'removing'`) // not-policy: the column's bound
      return
    }
  }
  if (scheduled.length) {
    const reason = await first<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.cancel-reason' AND slug = 'other'")
    if (!reason) refuse('core.run.no-reason', 'The cancel reason "other" is missing, so the run cannot be removed.', { status: 409 })
    const list = JSON.stringify(scheduled.map(p => p.id))
    unit.add(sql`UPDATE core_performances SET state = 'cancelled', cancelled_at = ${nowMs()}, cancel_reason_term_id = ${reason.id}, cancel_note = 'Removed with an unfinished run.'
      WHERE state = 'scheduled' AND run_id = ${row.id} AND id IN (SELECT value FROM json_each(${list}))`).expect(scheduled.length, CHANGED)
    unit.announce('core.performance.cancelled', scheduled.map(p => ({ payload: { performanceId: p.id, productionId: row.production_id, reason: 'other' }, record: ['core.performance', p.id] as const })))
    syncProductionDates(unit, row.production_id)
  }
  const more = drafts.length + scheduled.length === limit
  unit.add(sql`UPDATE core_performance_runs SET state = ${more ? 'removing' : 'removed'}, updated_at = ${nowMs()} WHERE id = ${row.id} AND state = 'removing'`).expect(1, CHANGED)
  if (more) unit.enqueue('core.create-run', { runId: row.id }, { dedupeKey: `${row.id}:remove:${nowMs()}` })
}
