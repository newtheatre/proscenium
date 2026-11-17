// Performances (part 2, group 1; part 3; C-03, C-05, C-06, C-07, C-10, C-12). Every move is guarded
// in the statement that makes it: the clash with another scheduled performance and a blocking
// closure are predicates on the update, so two people scheduling into the same space at once cannot
// both succeed. A read beforehand only chooses the words of the refusal.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, useDb, usePoint, useSetting } from '#kit'
import type { Actor, UnitView } from '#kit'
import type { SettingKey } from '#kit/registry-types'
import { assertTerm } from '../vocabularies/service'
import { assertNoBlockingClosure, closuresBetween } from '../places/closures'
import { instantOfLocal } from '#kit/clock'
import { dayRule, operatingDayOf } from '../calendar'
import type { ChangeImpact, ProposedChange } from '../points/change-impact'
import type { ChangeGuard, GuardAnswer } from '../points/change-guard'

export type PerformanceState = 'draft' | 'scheduled' | 'cancelled' | 'completed'

export interface AccessFeature { termId: string, detail: string | null }

export interface Performance {
  id: string
  productionId: string
  venueId: string
  spaceId: string
  startsAt: number
  doorsAt: number | null
  endsAt: number
  operatingDay: string
  intervalCount: number | null
  intervalMinutes: number | null
  capacity: number | null
  label: string | null
  externalBookingUrl: string | null
  state: PerformanceState
  cancelledAt: number | null
  cancelReasonTermId: string | null
  cancelNote: string | null
  completedAt: number | null
  /** Whether the theatre runs the performance's space (R-36). Core treats both alike. */
  spaceManaged: boolean
}

export interface PerformanceInput {
  venueId: string
  spaceId: string
  startsAt: number
  endsAt?: number
  doorsAt?: number | null
  intervalCount?: number | null
  intervalMinutes?: number | null
  capacity?: number | null
  label?: string | null
  externalBookingUrl?: string | null
  /** How long it lasts, intervals included: sets the end from the start when no end is given. */
  runningMinutes?: number | null
  /** How many minutes before the start the doors open: sets doors when no doors time is given. */
  doorsBeforeMinutes?: number | null
}

interface PerformanceRow {
  id: string
  production_id: string
  venue_id: string
  space_id: string
  starts_at: number
  doors_at: number | null
  ends_at: number
  operating_day: string
  interval_count: number | null
  interval_minutes: number | null
  capacity: number | null
  label: string | null
  external_booking_url: string | null
  state: PerformanceState
  cancelled_at: number | null
  cancel_reason_term_id: string | null
  cancel_note: string | null
  completed_at: number | null
  space_managed: number
}

/** The performance's space's managed, beside the performance's own columns. */
const SPACE_MANAGED = '(SELECT managed FROM core_spaces WHERE id = core_performances.space_id) AS space_managed'

const toPerformance = (r: PerformanceRow): Performance => ({
  spaceManaged: !!r.space_managed,
  id: r.id, productionId: r.production_id, venueId: r.venue_id, spaceId: r.space_id, startsAt: r.starts_at, doorsAt: r.doors_at, endsAt: r.ends_at,
  operatingDay: r.operating_day, intervalCount: r.interval_count, intervalMinutes: r.interval_minutes, capacity: r.capacity, label: r.label, externalBookingUrl: r.external_booking_url,
  state: r.state, cancelledAt: r.cancelled_at, cancelReasonTermId: r.cancel_reason_term_id, cancelNote: r.cancel_note, completedAt: r.completed_at,
})

const record = (id: string): ['core.performance', string] => ['core.performance', id]

async function performanceRow(id: string): Promise<PerformanceRow> {
  const row = await first<PerformanceRow>('SELECT * FROM core_performances WHERE id = ?', id)
  if (!row) refuse('core.performance.not-found', 'There is no such performance.', { status: 404 })
  return row
}

/** The production a performance belongs to, for routes whose ability is on the production. */
export async function productionOfPerformance(id: string): Promise<string> {
  return (await performanceRow(id)).production_id
}

// ---------------------------------------------------------------------------------------------
// Reads (part 4, services)

export async function getPerformance(id: string): Promise<Performance & { access: AccessFeature[], productionTitle: string, venueName: string, spaceName: string }> {
  const row = await first<PerformanceRow & { production_title: string, venue_name: string, space_name: string }>(`SELECT f.*, p.title AS production_title, v.name AS venue_name, s.name AS space_name, s.managed AS space_managed
    FROM core_performances f JOIN core_productions p ON p.id = f.production_id JOIN core_venues v ON v.id = f.venue_id JOIN core_spaces s ON s.id = f.space_id
    WHERE f.id = ?`, id)
  if (!row) refuse('core.performance.not-found', 'There is no such performance.', { status: 404 })
  return { ...toPerformance(row), access: await accessOf(id), productionTitle: row.production_title, venueName: row.venue_name, spaceName: row.space_name }
}

async function accessOf(id: string): Promise<AccessFeature[]> {
  return (await all<{ term_id: string, detail: string | null }>('SELECT term_id, detail FROM core_performance_access WHERE performance_id = ? ORDER BY term_id', id))
    .map(a => ({ termId: a.term_id, detail: a.detail }))
}

export interface PerformanceQuery { productionId?: string, from?: number, to?: number, state?: PerformanceState, spaceId?: string, venueId?: string }

/** Performances in a window, in time order, each with its access features. */
export async function listPerformances(query: PerformanceQuery): Promise<(Performance & { access: AccessFeature[] })[]> {
  const where: string[] = []
  const params: unknown[] = []
  for (const [clause, wanted] of [['production_id = ?', query.productionId], ['state = ?', query.state], ['space_id = ?', query.spaceId], ['venue_id = ?', query.venueId], ['ends_at > ?', query.from], ['starts_at < ?', query.to]] as const) {
    if (wanted === undefined) continue
    where.push(clause)
    params.push(wanted)
  }
  const rows = await all<PerformanceRow>(`SELECT *, ${SPACE_MANAGED} FROM core_performances ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY starts_at, id`, ...params)
  const access = new Map<string, AccessFeature[]>()
  if (rows.length) {
    for (const a of await all<{ performance_id: string, term_id: string, detail: string | null }>('SELECT performance_id, term_id, detail FROM core_performance_access WHERE performance_id IN (SELECT value FROM json_each(?)) ORDER BY term_id', JSON.stringify(rows.map(r => r.id))))
      access.set(a.performance_id, [...(access.get(a.performance_id) ?? []), { termId: a.term_id, detail: a.detail }])
  }
  return rows.map(r => ({ ...toPerformance(r), access: access.get(r.id) ?? [] }))
}

/** Everything on one operating day: front of house's "tonight". */
export async function listPerformancesOnDay(operatingDay: string): Promise<Performance[]> {
  return (await all<PerformanceRow>(`SELECT *, ${SPACE_MANAGED} FROM core_performances WHERE operating_day = ? ORDER BY starts_at, id`, operatingDay)).map(toPerformance)
}

/** The house capacity of one performance: its own if set, else its production's, else its space's, else uncapped (null). */
export async function capacityOf(performanceId: string): Promise<number | null> {
  const row = await first<{ capacity: number | null }>(`SELECT coalesce(f.capacity, p.capacity, s.default_capacity) AS capacity
    FROM core_performances f JOIN core_spaces s ON s.id = f.space_id JOIN core_productions p ON p.id = f.production_id WHERE f.id = ?`, performanceId)
  if (!row) refuse('core.performance.not-found', 'There is no such performance.', { status: 404 })
  return row.capacity
}

// ---------------------------------------------------------------------------------------------
// Defaults (run presets concept, Matt 2026-11-17)

/**
 * What a new performance of this production in this space takes when it says nothing: each from
 * the production, then the space, then the theatre's settings. Running time includes intervals.
 * Capacity and the booking link are left for the performance to inherit as it is read.
 */
export interface PerformanceDefaults {
  runningMinutes: number
  doorsBeforeMinutes: number
  intervalCount: number
  intervalMinutes: number
  capacity: number | null
  externalBookingUrl: string | null
}

const minutesOf = async (key: SettingKey) => Math.round((await useSetting(key) as number) / 60) // not-policy: seconds to minutes

/** The theatre's own defaults, from its settings. */
export async function theatreDefaults(): Promise<{ runningMinutes: number, doorsBeforeMinutes: number, intervalCount: number, intervalMinutes: number, turnaroundMinutes: number }> {
  return {
    runningMinutes: await minutesOf('core.programme.default-running-time'),
    doorsBeforeMinutes: await minutesOf('core.programme.doors-before'),
    intervalCount: await useSetting('core.programme.intervals') as number,
    intervalMinutes: await minutesOf('core.programme.interval-length'),
    turnaroundMinutes: await minutesOf('core.programme.turnaround'),
  }
}

export async function performanceDefaults(productionId: string, spaceId: string | null): Promise<PerformanceDefaults> {
  const production = await first<{ running_minutes: number | null, doors_before_minutes: number | null, interval_count: number, interval_minutes: number | null, capacity: number | null, external_booking_url: string | null }>(
    'SELECT running_minutes, doors_before_minutes, interval_count, interval_minutes, capacity, external_booking_url FROM core_productions WHERE id = ?', productionId)
  if (!production) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  const space = spaceId ? await first<{ doors_before_minutes: number | null, default_capacity: number | null }>('SELECT doors_before_minutes, default_capacity FROM core_spaces WHERE id = ?', spaceId) : null
  const theatre = await theatreDefaults()
  return {
    runningMinutes: production.running_minutes ?? theatre.runningMinutes,
    doorsBeforeMinutes: production.doors_before_minutes ?? space?.doors_before_minutes ?? theatre.doorsBeforeMinutes,
    intervalCount: production.interval_count,
    intervalMinutes: production.interval_minutes ?? theatre.intervalMinutes,
    capacity: production.capacity ?? space?.default_capacity ?? null,
    externalBookingUrl: production.external_booking_url,
  }
}

/** The turnaround between performances in one space, in milliseconds (core.programme.turnaround). */
export async function turnaroundMs(): Promise<number> {
  return (await useSetting('core.programme.turnaround') as number) * 1000 // not-policy: seconds to milliseconds
}

// ---------------------------------------------------------------------------------------------
// The space guard

/**
 * No other scheduled performance overlaps [from, to) in this space, if the space is exclusive.
 * `except` leaves out the performance being moved. `gap` is the turnaround in milliseconds: another
 * performance must end at least that long before this starts, and start that long after it ends. A
 * statement predicate.
 */
export function noClash(spaceId: string | SQL, from: number | SQL, to: number | SQL, except: string | null = null, gap = 0): SQL {
  return sql`((SELECT exclusive FROM core_spaces WHERE id = ${spaceId}) = 0 OR NOT EXISTS (SELECT 1 FROM core_performances o
    WHERE o.space_id = ${spaceId} AND o.state = 'scheduled' AND o.starts_at < ${to} + ${gap} AND o.ends_at + ${gap} > ${from} AND o.id IS NOT ${except}))`
}

/**
 * A predicate a caller puts on its own write: no scheduled performance in this space overlaps
 * [from, to), and no blocking closure of the space, its venue or the whole theatre does. Like
 * assertTerm, it goes on the statement, never in a read made beforehand.
 */
export function assertSpaceFree(spaceId: string | SQL, from: number | SQL, to: number | SQL, gap = 0): SQL {
  return sql`(${noClash(spaceId, from, to, null, gap)} AND ${assertNoBlockingClosure(spaceId, from, to)})`
}

/** The same test as a read, for showing. Never for deciding a write: use assertSpaceFree. */
export async function isSpaceFree(spaceId: string, from: number, to: number): Promise<boolean> {
  return !!(await useDb().get<{ free: number }>(sql`SELECT ${assertSpaceFree(spaceId, from, to, await turnaroundMs())} AS free`))?.free
}

/** The space belongs to the venue, can hold performances and is not archived. */
export const spaceFits = (venueId: string, spaceId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM core_spaces WHERE id = ${spaceId} AND venue_id = ${venueId} AND performable = 1 AND state = 'active')`

const SPACE_UNSUITABLE = { code: 'core.performance.space-unsuitable', reason: 'Choose a space in that venue that is in use and can hold performances.' }
const CHANGED = { code: 'core.performance.changed', reason: 'The space was taken, or the performance changed, just now.', remedy: 'Refresh and try again.' }

/**
 * Why [from, to) cannot be scheduled in this space, in the words the person sees, or null. A read:
 * it chooses the refusal, and the statement's predicate decides.
 */
export async function whyNotFree(spaceId: string, from: number, to: number, except: string | null): Promise<{ code: string, reason: string } | null> {
  const space = await first<{ exclusive: number }>('SELECT exclusive FROM core_spaces WHERE id = ?', spaceId)
  if (space?.exclusive) {
    const gap = await turnaroundMs()
    const clash = await first<{ title: string, starts_at: number }>(`SELECT p.title, o.starts_at FROM core_performances o JOIN core_productions p ON p.id = o.production_id
      WHERE o.space_id = ? AND o.state = 'scheduled' AND o.starts_at < ? AND o.ends_at > ? AND o.id IS NOT ? ORDER BY o.starts_at LIMIT 1`, spaceId, to + gap, from - gap, except)
    if (clash) return { code: 'core.performance.clash', reason: gap ? `${clash.title} is scheduled in this space at that time, or too close to it for the turnaround.` : `${clash.title} is already scheduled in this space at that time.` }
  }
  const closure = (await closuresBetween(from, to, { spaceId })).find(c => c.blocksPerformances)
  if (closure) return { code: 'core.performance.closed', reason: `The space is closed then: ${closure.title}.` }
  return null
}

/** Public holidays and other closures that do not block, for a warning the person can accept. */
export async function warningsFor(spaceId: string, from: number, to: number): Promise<string[]> {
  return (await closuresBetween(from, to, { spaceId })).filter(c => !c.blocksPerformances).map(c => c.title)
}

/** Keeps the production's first start and last end in step, in the same unit as the change. */
export function syncProductionDates(unit: UnitView, productionId: string): void {
  unit.add(sql`UPDATE core_productions SET
      first_starts_at = (SELECT min(starts_at) FROM core_performances WHERE production_id = ${productionId} AND state <> 'draft'),
      last_ends_at = (SELECT max(ends_at) FROM core_performances WHERE production_id = ${productionId} AND state NOT IN ('draft', 'cancelled'))
    WHERE id = ${productionId}`)
}

// ---------------------------------------------------------------------------------------------
// Change impact and guards (part 3, "Changes with a wide reach")

/** Every module's lines for a proposed change, for the confirmation. */
export async function changeImpact(change: ProposedChange, actor: Actor): Promise<string[]> {
  const lines: string[] = []
  for (const c of await usePoint<ChangeImpact>('core.change-impact')) lines.push(...await c.value.impact(change, actor))
  return lines
}

/** The first module that refuses the change, or null. */
export async function firstRefusal(change: ProposedChange, actor: Actor): Promise<(GuardAnswer & { allowed: false }) | null> {
  for (const c of await usePoint<ChangeGuard>('core.change-guard')) {
    const answer = await c.value.check(change, actor)
    if (!answer.allowed) return answer
  }
  return null
}

async function runGuards(change: ProposedChange, actor: Actor): Promise<void> {
  const refusal = await firstRefusal(change, actor)
  if (refusal) refuse(refusal.code, refusal.reason, { status: 409, ...(refusal.link ? { remedy: refusal.link } : {}) })
}

// ---------------------------------------------------------------------------------------------
// Writes

type Times<T> = Omit<T, 'startsAt' | 'endsAt' | 'doorsAt'> & { startsAt?: number | string, endsAt?: number | string, doorsAt?: number | string | null }

/** Turns local date-times from the console into instants in the theatre's time zone. */
export async function inInstants<T extends PerformancePatch>(input: Times<T>): Promise<T> {
  const local = (['startsAt', 'endsAt', 'doorsAt'] as const).filter(k => typeof input[k] === 'string')
  if (!local.length) return input as T
  const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet. Finish setup first.', { status: 409 })
  const out: Record<string, unknown> = { ...input }
  for (const k of local) {
    const v = input[k] as string
    out[k] = instantOfLocal(v.slice(0, 10), v.slice(11, 16), rule.timeZone) // not-policy: positions in YYYY-MM-DDTHH:mm
  }
  return out as T
}

function checkTimes(startsAt: number, endsAt: number, doorsAt: number | null) {
  if (endsAt <= startsAt) refuse('core.performance.times', 'A performance must end after it starts.', { status: 422, fields: { endsAt: 'The end must be after the start.' } })
  if (doorsAt !== null && doorsAt > startsAt) refuse('core.performance.doors', 'Doors must open at or before the start.', { status: 422, fields: { doorsAt: 'Doors must open at or before the start.' } })
}

const MINUTE = 60_000 // not-policy: milliseconds in a minute

/**
 * C-03: a new performance, as a draft. The end comes from its running time and doors from its lead,
 * each its own if given, else the production's, the space's or the theatre's (performanceDefaults).
 */
export async function createPerformance(unit: UnitView, productionId: string, input: PerformanceInput, actorId: string | null): Promise<string> {
  const production = await first<{ state: string }>('SELECT state FROM core_productions WHERE id = ?', productionId)
  if (!production) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  if (production.state === 'cancelled') refuse('core.production.cancelled', 'A cancelled production cannot have new performances.', { status: 409 })
  const defaults = await performanceDefaults(productionId, input.spaceId)
  const endsAt = input.endsAt ?? input.startsAt + (input.runningMinutes ?? defaults.runningMinutes) * MINUTE
  const doorsAt = input.doorsAt === undefined ? input.startsAt - (input.doorsBeforeMinutes ?? defaults.doorsBeforeMinutes) * MINUTE : input.doorsAt
  checkTimes(input.startsAt, endsAt, doorsAt)
  const id = newId('perf')
  unit.add(sql`INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, doors_at, ends_at, operating_day, interval_count, interval_minutes, capacity, label, external_booking_url, state, created_at)
    SELECT ${id}, ${productionId}, ${input.venueId}, ${input.spaceId}, ${input.startsAt}, ${doorsAt}, ${endsAt}, ${await operatingDayOf(input.startsAt)},
      ${input.intervalCount ?? null}, ${input.intervalMinutes ?? null}, ${input.capacity ?? null}, ${input.label ?? null}, ${input.externalBookingUrl ?? null}, 'draft', ${nowMs()}
    WHERE ${spaceFits(input.venueId, input.spaceId)}`).expect(1, SPACE_UNSUITABLE)
  unit.audit({ action: 'create', record: record(id), detail: { productionId, by: actorId } })
  return id
}

/** C-05: draft to scheduled, so the public can see it. Returns warnings the person may want to know. */
export async function schedulePerformance(unit: UnitView, id: string): Promise<{ warnings: string[] }> {
  const row = await performanceRow(id)
  if (row.state === 'scheduled') return { warnings: [] }
  if (row.state !== 'draft') refuse('core.performance.not-draft', 'Only a draft performance can be scheduled.', { status: 409 })
  return putOnSchedule(unit, row, false)
}

/** Cancelled back to scheduled, if it has not started: the guards pass again. */
export async function reinstatePerformance(unit: UnitView, id: string): Promise<{ warnings: string[] }> {
  const row = await performanceRow(id)
  if (row.state !== 'cancelled') refuse('core.performance.not-cancelled', 'Only a cancelled performance can be reinstated.', { status: 409 })
  return putOnSchedule(unit, row, true)
}

async function putOnSchedule(unit: UnitView, row: PerformanceRow, reinstated: boolean): Promise<{ warnings: string[] }> {
  const at = nowMs()
  if (row.starts_at <= at) refuse('core.performance.started', 'A performance that has already started cannot be scheduled.', { status: 409 })
  const why = await whyNotFree(row.space_id, row.starts_at, row.ends_at, row.id)
  if (why) refuse(why.code, why.reason, { status: 409 })
  unit.add(sql`UPDATE core_performances SET state = 'scheduled', cancelled_at = NULL, cancel_reason_term_id = NULL, cancel_note = NULL
    WHERE id = ${row.id} AND state = ${row.state} AND starts_at > ${at}
      AND ${noClash(row.space_id, row.starts_at, row.ends_at, row.id, await turnaroundMs())} AND ${assertNoBlockingClosure(row.space_id, row.starts_at, row.ends_at)}`).expect(1, CHANGED)
  syncProductionDates(unit, row.production_id)
  unit.audit({ action: 'state', record: record(row.id), detail: { from: row.state, to: 'scheduled' } })
  unit.announce('core.performance.scheduled', { performanceId: row.id, productionId: row.production_id, reinstated }, { record: record(row.id) })
  return { warnings: await warningsFor(row.space_id, row.starts_at, row.ends_at) }
}

/** C-06: scheduled to cancelled, with a reason. Any module may refuse through the change guard. */
export async function cancelPerformance(unit: UnitView, id: string, input: { reasonTermId: string, note?: string | null }, actor: Actor): Promise<void> {
  const row = await performanceRow(id)
  if (row.state !== 'scheduled') refuse('core.performance.not-scheduled', 'Only a scheduled performance can be cancelled.', { status: 409 })
  const reason = await first<{ slug: string }>('SELECT slug FROM core_terms WHERE id = ? AND vocabulary_key = \'core.cancel-reason\' AND retired_at IS NULL', input.reasonTermId)
  if (!reason) refuse('core.performance.reason-unknown', 'Choose a reason from the list.', { status: 422, fields: { reasonTermId: 'Choose a reason from the list.' } })
  await runGuards({ record: { type: 'core.performance', id }, kind: 'cancel' }, actor)
  unit.add(sql`UPDATE core_performances SET state = 'cancelled', cancelled_at = ${nowMs()}, cancel_reason_term_id = ${input.reasonTermId}, cancel_note = ${input.note ?? null}
    WHERE id = ${id} AND state = 'scheduled' AND ${assertTerm(input.reasonTermId, 'core.cancel-reason')}`).expect(1, CHANGED)
  syncProductionDates(unit, row.production_id)
  unit.audit({ action: 'state', record: record(id), detail: { from: 'scheduled', to: 'cancelled', reason: reason.slug } })
  unit.announce('core.performance.cancelled', { performanceId: id, productionId: row.production_id, reason: reason.slug }, { record: record(id) })
}

export type PerformancePatch = Partial<PerformanceInput>

/**
 * C-07: a new time, place, capacity or detail. On a scheduled performance a new time or place
 * passes the same guards as scheduling, every module may refuse it, and each kind of change is
 * announced with the old and new values. A completed or cancelled performance cannot change.
 */
export async function updatePerformance(unit: UnitView, id: string, patch: PerformancePatch, actor: Actor): Promise<{ warnings: string[] }> {
  const row = await performanceRow(id)
  if (row.state === 'completed') refuse('core.performance.completed', 'A completed performance cannot be changed.', { status: 409 })
  if (row.state === 'cancelled') refuse('core.performance.cancelled', 'A cancelled performance cannot be changed.', { status: 409, remedy: 'Reinstate it first.' })
  const startsAt = patch.startsAt ?? row.starts_at
  const next = {
    venueId: patch.venueId ?? row.venue_id,
    spaceId: patch.spaceId ?? row.space_id,
    startsAt,
    // A running time keeps the end that long after the (new) start; a lead does the same for doors.
    endsAt: patch.endsAt ?? (patch.runningMinutes ? startsAt + patch.runningMinutes * MINUTE : row.ends_at),
    doorsAt: patch.doorsAt !== undefined ? patch.doorsAt : patch.doorsBeforeMinutes != null ? startsAt - patch.doorsBeforeMinutes * MINUTE : row.doors_at,
    intervalCount: patch.intervalCount === undefined ? row.interval_count : patch.intervalCount,
    intervalMinutes: patch.intervalMinutes === undefined ? row.interval_minutes : patch.intervalMinutes,
    capacity: patch.capacity === undefined ? row.capacity : patch.capacity,
    label: patch.label === undefined ? row.label : patch.label,
    externalBookingUrl: patch.externalBookingUrl === undefined ? row.external_booking_url : patch.externalBookingUrl,
  }
  // Moving the start moves doors with it, unless the patch says where doors are.
  if (patch.startsAt !== undefined && patch.doorsAt === undefined && patch.doorsBeforeMinutes == null && row.doors_at !== null) next.doorsAt = row.doors_at + (next.startsAt - row.starts_at)
  checkTimes(next.startsAt, next.endsAt, next.doorsAt)
  const retimed = next.startsAt !== row.starts_at || next.endsAt !== row.ends_at
  const moved = next.spaceId !== row.space_id || next.venueId !== row.venue_id
  const recapacitied = next.capacity !== row.capacity
  const scheduled = row.state === 'scheduled'
  const guards: SQL[] = []
  if (moved) guards.push(spaceFits(next.venueId, next.spaceId))
  if (scheduled && (retimed || moved)) {
    if (next.startsAt <= nowMs()) refuse('core.performance.started', 'A performance cannot be moved to a time that has passed.', { status: 409 })
    const why = await whyNotFree(next.spaceId, next.startsAt, next.endsAt, id)
    if (why) refuse(why.code, why.reason, { status: 409 })
    guards.push(noClash(next.spaceId, next.startsAt, next.endsAt, id, await turnaroundMs()), assertNoBlockingClosure(next.spaceId, next.startsAt, next.endsAt))
  }
  if (scheduled) {
    const to = { startsAt: next.startsAt, endsAt: next.endsAt, venueId: next.venueId, spaceId: next.spaceId, capacity: next.capacity }
    if (retimed) await runGuards({ record: { type: 'core.performance', id }, kind: 'reschedule', to }, actor)
    if (moved) await runGuards({ record: { type: 'core.performance', id }, kind: 'move', to }, actor)
    if (recapacitied) await runGuards({ record: { type: 'core.performance', id }, kind: 'capacity', to }, actor)
  }
  const day = retimed ? await operatingDayOf(next.startsAt) : row.operating_day
  unit.add(sql`UPDATE core_performances SET venue_id = ${next.venueId}, space_id = ${next.spaceId}, starts_at = ${next.startsAt}, ends_at = ${next.endsAt},
      doors_at = ${next.doorsAt}, operating_day = ${day}, interval_count = ${next.intervalCount}, interval_minutes = ${next.intervalMinutes}, capacity = ${next.capacity}, label = ${next.label},
      external_booking_url = ${next.externalBookingUrl}
    WHERE id = ${id} AND state = ${row.state} AND starts_at = ${row.starts_at} AND space_id = ${row.space_id}${guards.length ? sql` AND ${sql.join(guards, sql` AND `)}` : sql``}`)
    .expect(1, moved && !scheduled ? SPACE_UNSUITABLE : CHANGED)
  if (scheduled && retimed) syncProductionDates(unit, row.production_id)
  unit.audit({ action: 'update', record: record(id), detail: { retimed, moved, capacity: recapacitied } })
  const target = { record: record(id) }
  if (scheduled && retimed)
    unit.announce('core.performance.rescheduled', { performanceId: id, productionId: row.production_id, oldStartsAt: row.starts_at, oldEndsAt: row.ends_at, startsAt: next.startsAt, endsAt: next.endsAt }, target)
  if (scheduled && moved)
    unit.announce('core.performance.moved', { performanceId: id, productionId: row.production_id, oldVenueId: row.venue_id, oldSpaceId: row.space_id, venueId: next.venueId, spaceId: next.spaceId }, target)
  if (scheduled && recapacitied)
    unit.announce('core.performance.capacity-changed', { performanceId: id, productionId: row.production_id, oldCapacity: row.capacity, capacity: next.capacity }, target)
  return { warnings: scheduled && (retimed || moved) ? await warningsFor(next.spaceId, next.startsAt, next.endsAt) : [] }
}

/** C-10: replaces a performance's access features with the list given. */
export async function setPerformanceAccess(unit: UnitView, id: string, features: AccessFeature[]): Promise<void> {
  const row = await performanceRow(id)
  if (row.state === 'completed') refuse('core.performance.completed', 'A completed performance cannot be changed.', { status: 409 })
  if (new Set(features.map(f => f.termId)).size !== features.length) refuse('core.performance.access-repeated', 'Each access feature can be listed once.', { status: 422 })
  unit.add(sql`DELETE FROM core_performance_access WHERE performance_id = ${id}`)
  for (const f of features) {
    unit.add(sql`INSERT INTO core_performance_access (performance_id, term_id, detail) SELECT ${id}, ${f.termId}, ${f.detail} WHERE ${assertTerm(f.termId, 'core.access-feature')}`)
      .expect(1, { code: 'core.performance.access-unknown', reason: 'Choose access features from the list.' })
  }
  unit.audit({ action: 'update', record: record(id), detail: { access: features.length } })
}

/** A draft that was never scheduled can be deleted (a draft never was: nothing returns to draft). */
export async function deletePerformance(unit: UnitView, id: string): Promise<void> {
  await performanceRow(id)
  unit.add(sql`DELETE FROM core_performances WHERE id = ${id} AND state = 'draft'`)
    .expect(1, { code: 'core.performance.not-deletable', reason: 'Only a draft performance can be deleted.', remedy: 'Cancel it instead.' })
  unit.audit({ action: 'delete', record: record(id) })
}

/**
 * C-12: scheduled performances that have ended become completed, each announced once. The update
 * expects as many rows as were read, so a second run at the same moment writes nothing.
 */
export async function completeEnded(unit: UnitView): Promise<number> {
  const at = nowMs()
  const limit = await useSetting('core.units.set-rows-limit') as number
  const ended = await all<{ id: string, production_id: string, operating_day: string }>(
    'SELECT id, production_id, operating_day FROM core_performances WHERE state = \'scheduled\' AND ends_at <= ? ORDER BY ends_at, id LIMIT ?', at, limit)
  if (!ended.length) return 0
  unit.add(sql`UPDATE core_performances SET state = 'completed', completed_at = ${at} WHERE state = 'scheduled' AND id IN (SELECT value FROM json_each(${JSON.stringify(ended.map(r => r.id))}))`)
    .expect(ended.length, { code: 'core.performance.changed', reason: 'Another run completed these performances.' })
  for (const r of ended) unit.announce('core.performance.completed', { performanceId: r.id, productionId: r.production_id }, { record: record(r.id) })
  return ended.length
}

/**
 * Venue and space guards (part 3): archiving is refused while a future scheduled performance uses
 * it, and deleting once it has ever had a performance. Statement predicates.
 */
export const noFuturePerformancesIn = (column: 'venue_id' | 'space_id', id: string): SQL =>
  sql`NOT EXISTS (SELECT 1 FROM core_performances WHERE ${sql.raw(column)} = ${id} AND state = 'scheduled' AND ends_at > ${nowMs()})`
export const neverPerformedIn = (column: 'venue_id' | 'space_id', id: string): SQL =>
  sql`NOT EXISTS (SELECT 1 FROM core_performances WHERE ${sql.raw(column)} = ${id})`
