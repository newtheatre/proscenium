// Performances (part 2, group 1; part 3; C-03, C-05, C-06, C-07, C-10, C-12). Every move is guarded
// in the statement that makes it: the clash with another scheduled performance and a blocking
// closure are predicates on the update, so two people scheduling into the same space at once cannot
// both succeed. A read beforehand only chooses the words of the refusal.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, TIME_ZONE_REMEDY, useSetting } from '#kit'
import type { Actor, UnitView } from '#kit'
import type { SettingKey } from '#kit/registry-types'
import { assertTerm } from '../vocabularies/service'
import { assertNoBlockingClosure } from '../places/closures'
import { noClash, runGuards, spaceFits, turnaroundMs, warningsFor, whyNotFree } from './performances-checks'
import { instantOfLocal } from '#kit/clock'
import { dayRule, operatingDayOf } from '../calendar'
import { latecomerRule, type LatecomerRule } from '../../shared/latecomers'

export { assertSpaceFree, changeImpact, firstRefusal, isSpaceFree, noClash, spaceFits, turnaroundMs, whyNotFree } from './performances-checks'

export type PerformanceState = 'draft' | 'scheduled' | 'cancelled' | 'completed'
/** Timed, or drop-in: open from its start until its end, with no doors or intervals (C-62). */
export type PerformanceShape = 'timed' | 'drop-in'

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
  shape: PerformanceShape
  /** Whether the theatre runs the performance's space (R-36). Core treats both alike. */
  spaceManaged: boolean
}

export interface PerformanceInput {
  /** Chosen when made, and changed only while a draft (DI1). Timed when not given. */
  shape?: PerformanceShape
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
  shape: PerformanceShape
  space_managed: number
}

/** The performance's space's managed, beside the performance's own columns. */
const SPACE_MANAGED = '(SELECT managed FROM core_spaces WHERE id = core_performances.space_id) AS space_managed'

const toPerformance = (r: PerformanceRow): Performance => ({
  spaceManaged: !!r.space_managed,
  id: r.id, productionId: r.production_id, venueId: r.venue_id, spaceId: r.space_id, startsAt: r.starts_at, doorsAt: r.doors_at, endsAt: r.ends_at,
  operatingDay: r.operating_day, intervalCount: r.interval_count, intervalMinutes: r.interval_minutes, capacity: r.capacity, label: r.label, externalBookingUrl: r.external_booking_url,
  state: r.state, cancelledAt: r.cancelled_at, cancelReasonTermId: r.cancel_reason_term_id, cancelNote: r.cancel_note, completedAt: r.completed_at,
  shape: r.shape,
})

const record = (id: string): ['core.performance', string] => ['core.performance', id]

async function performanceRow(id: string): Promise<PerformanceRow> {
  const row = await first<PerformanceRow>('SELECT * FROM core_performances WHERE id = ?', id)
  if (!row) refuse('core.performance.not-found', 'There is no such performance.', { status: 404 })
  return row
}

// ---------------------------------------------------------------------------------------------
// Reads (part 4, services)

export async function getPerformance(id: string): Promise<Performance & { access: AccessFeature[], effectsOff: string[], productionTitle: string, venueName: string, spaceName: string }> {
  const row = await first<PerformanceRow & { production_title: string, venue_name: string, space_name: string }>(`SELECT f.*, p.title AS production_title, v.name AS venue_name, s.name AS space_name, s.managed AS space_managed
    FROM core_performances f JOIN core_productions p ON p.id = f.production_id JOIN core_venues v ON v.id = f.venue_id JOIN core_spaces s ON s.id = f.space_id
    WHERE f.id = ?`, id)
  if (!row) refuse('core.performance.not-found', 'There is no such performance.', { status: 404 })
  return { ...toPerformance(row), access: await accessOf(id), effectsOff: await effectsOffOf(id), productionTitle: row.production_title, venueName: row.venue_name, spaceName: row.space_name }
}

async function accessOf(id: string): Promise<AccessFeature[]> {
  return (await all<{ term_id: string, detail: string | null }>('SELECT term_id, detail FROM core_performance_access WHERE performance_id = ? ORDER BY term_id', id))
    .map(a => ({ termId: a.term_id, detail: a.detail }))
}

/** The staging effects (term ids) a performance does not use. */
export async function effectsOffOf(id: string): Promise<string[]> {
  return (await all<{ term_id: string }>('SELECT term_id FROM core_performance_effect_exceptions WHERE performance_id = ? ORDER BY term_id', id)).map(r => r.term_id)
}

export interface PerformanceQuery { productionId?: string, from?: number, to?: number, state?: PerformanceState, spaceId?: string, venueId?: string }

/** Performances in a window, in time order, each with its access features. */
export async function listPerformances(query: PerformanceQuery): Promise<(Performance & { access: AccessFeature[], effectsOff: string[] })[]> {
  const where: string[] = []
  const params: unknown[] = []
  for (const [clause, wanted] of [['production_id = ?', query.productionId], ['state = ?', query.state], ['space_id = ?', query.spaceId], ['venue_id = ?', query.venueId], ['ends_at > ?', query.from], ['starts_at < ?', query.to]] as const) {
    if (wanted === undefined) continue
    where.push(clause)
    params.push(wanted)
  }
  const rows = await all<PerformanceRow>(`SELECT *, ${SPACE_MANAGED} FROM core_performances ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY starts_at, id`, ...params)
  const access = new Map<string, AccessFeature[]>()
  const off = new Map<string, string[]>()
  if (rows.length) {
    for (const e of await all<{ performance_id: string, term_id: string }>('SELECT performance_id, term_id FROM core_performance_effect_exceptions WHERE performance_id IN (SELECT value FROM json_each(?)) ORDER BY term_id', JSON.stringify(rows.map(r => r.id))))
      off.set(e.performance_id, [...(off.get(e.performance_id) ?? []), e.term_id])
    for (const a of await all<{ performance_id: string, term_id: string, detail: string | null }>('SELECT performance_id, term_id, detail FROM core_performance_access WHERE performance_id IN (SELECT value FROM json_each(?)) ORDER BY term_id', JSON.stringify(rows.map(r => r.id))))
      access.set(a.performance_id, [...(access.get(a.performance_id) ?? []), { termId: a.term_id, detail: a.detail }])
  }
  return rows.map(r => ({ ...toPerformance(r), access: access.get(r.id) ?? [], effectsOff: off.get(r.id) ?? [] }))
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
export async function theatreDefaults(): Promise<{ runningMinutes: number, doorsBeforeMinutes: number, intervalCount: number, intervalMinutes: number, turnaroundMinutes: number, latecomers: LatecomerRule }> {
  return {
    runningMinutes: await minutesOf('core.programme.default-running-time'),
    doorsBeforeMinutes: await minutesOf('core.programme.doors-before'),
    intervalCount: await useSetting('core.programme.intervals') as number,
    intervalMinutes: await minutesOf('core.programme.interval-length'),
    turnaroundMinutes: await minutesOf('core.programme.turnaround'),
    latecomers: latecomerRule(null, await useSetting('core.visiting.latecomers') as string, 1),
  }
}

type DefaultsRow = { running_minutes: number | null, doors_before_minutes: number | null, interval_count: number, interval_minutes: number | null, capacity: number | null, external_booking_url: string | null }

/** What a production made earlier in the same unit gives its performances, before it can be read. */
export interface MadeProduction { runningMinutes?: number | null, doorsBeforeMinutes?: number | null }

export async function performanceDefaults(productionId: string, spaceId: string | null, made?: MadeProduction): Promise<PerformanceDefaults> {
  const read = await first<DefaultsRow>('SELECT running_minutes, doors_before_minutes, interval_count, interval_minutes, capacity, external_booking_url FROM core_productions WHERE id = ?', productionId)
  const production: DefaultsRow | undefined = read ?? (made && { running_minutes: made.runningMinutes ?? null, doors_before_minutes: made.doorsBeforeMinutes ?? null, interval_count: await useSetting('core.programme.intervals') as number, interval_minutes: null, capacity: null, external_booking_url: null })
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

const SPACE_UNSUITABLE = { code: 'core.performance.space-unsuitable', reason: 'Choose a space in that venue that is in use and can hold performances.' }
const NOT_PLACED = { code: 'core.performance.not-placed', reason: 'The production or the space cannot take a new performance.' }
const CHANGED = { code: 'core.performance.changed', reason: 'The space was taken, or the performance changed, just now.', remedy: 'Refresh and try again.' }

/** Keeps the production's first start and last end in step, in the same unit as the change. */
export function syncProductionDates(unit: UnitView, productionId: string): void {
  unit.add(sql`UPDATE core_productions SET
      first_starts_at = (SELECT min(starts_at) FROM core_performances WHERE production_id = ${productionId} AND state <> 'draft'),
      last_ends_at = (SELECT max(ends_at) FROM core_performances WHERE production_id = ${productionId} AND state NOT IN ('draft', 'cancelled'))
    WHERE id = ${productionId}`)
}

// ---------------------------------------------------------------------------------------------
// Writes

type Times<T> = Omit<T, 'startsAt' | 'endsAt' | 'doorsAt'> & { startsAt?: number | string, endsAt?: number | string, doorsAt?: number | string | null }

/** Turns local date-times from the console into instants in the theatre's time zone. */
export async function inInstants<T extends PerformancePatch>(input: Times<T>): Promise<T> {
  const local = (['startsAt', 'endsAt', 'doorsAt'] as const).filter(k => typeof input[k] === 'string')
  if (!local.length) return input as T
  const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet.', { status: 409, remedy: TIME_ZONE_REMEDY })
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

/** DI2: a drop-in opens and closes within one operating day; the caller has already cleared its doors and intervals. */
async function checkDropIn(startsAt: number, endsAt: number): Promise<void> {
  if (await operatingDayOf(startsAt) !== await operatingDayOf(endsAt - 1))
    refuse('core.performance.drop-in-one-day', 'A drop-in opens and closes on the same day.', { status: 422, fields: { endsAt: 'Close it the same day, or make one drop-in for each day.' } })
}

const MINUTE = 60_000 // not-policy: milliseconds in a minute

/**
 * C-03: a new performance, as a draft. The end comes from its running time and doors from its lead,
 * each its own if given, else the production's, the space's or the theatre's (performanceDefaults).
 */
export async function createPerformance(unit: UnitView, productionId: string, input: PerformanceInput, by: { actorId: string | null, made?: MadeProduction }): Promise<string> {
  const { actorId, made } = by
  const production = await first<{ state: string }>('SELECT state FROM core_productions WHERE id = ?', productionId)
  // A production made earlier in the same unit is not there to read yet; the statement checks it.
  if (!production && !made) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  if (production?.state === 'cancelled') refuse('core.production.cancelled', 'A cancelled production cannot have new performances.', { status: 409 })
  const defaults = await performanceDefaults(productionId, input.spaceId, made)
  const shape = input.shape ?? 'timed'
  const endsAt = input.endsAt ?? input.startsAt + (input.runningMinutes ?? defaults.runningMinutes) * MINUTE
  const doorsAt = shape === 'drop-in' ? null : input.doorsAt === undefined ? input.startsAt - (input.doorsBeforeMinutes ?? defaults.doorsBeforeMinutes) * MINUTE : input.doorsAt
  checkTimes(input.startsAt, endsAt, doorsAt)
  if (shape === 'drop-in') await checkDropIn(input.startsAt, endsAt)
  const id = newId('perf')
  unit.add(sql`INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, doors_at, ends_at, operating_day, interval_count, interval_minutes, capacity, label, external_booking_url, state, shape, created_at)
    SELECT ${id}, ${productionId}, ${input.venueId}, ${input.spaceId}, ${input.startsAt}, ${doorsAt}, ${endsAt}, ${await operatingDayOf(input.startsAt)},
      ${shape === 'drop-in' ? 0 : input.intervalCount ?? null}, ${shape === 'drop-in' ? null : input.intervalMinutes ?? null}, ${input.capacity ?? null}, ${input.label ?? null}, ${input.externalBookingUrl ?? null}, 'draft', ${shape}, ${nowMs()}
    WHERE ${spaceFits(input.venueId, input.spaceId)} AND EXISTS (SELECT 1 FROM core_productions WHERE id = ${productionId} AND state <> 'cancelled')`).expect(1, production ? SPACE_UNSUITABLE : NOT_PLACED)
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

export type ScheduleRefusal = 'space-taken' | 'closed' | 'not-draft' | 'started'

/**
 * C-68: many drafts to scheduled at once, as publishing a plan does. Each is read first: one that is
 * not a draft, has started, clashes or is closed is reported and left out, and so is one that would
 * clash with a draft scheduled earlier in the same call. The rest each get their own conditional
 * update with the space and closure predicates, so a change between the read and the write refuses
 * the whole unit as core.performance.changed.
 */
export async function schedulePerformances(unit: UnitView, ids: readonly string[]): Promise<{ scheduled: string[], refused: { id: string, reason: ScheduleRefusal }[] }> {
  const wanted = [...new Set(ids)]
  const rows = new Map((await all<PerformanceRow & { exclusive: number }>(`SELECT p.*, s.exclusive FROM core_performances p JOIN core_spaces s ON s.id = p.space_id
    WHERE p.id IN (SELECT value FROM json_each(?))`, JSON.stringify(wanted))).map(r => [r.id, r]))
  const at = nowMs()
  const gap = await turnaroundMs()
  const scheduled: (PerformanceRow & { exclusive: number })[] = []
  const refused: { id: string, reason: ScheduleRefusal }[] = []
  for (const id of wanted) {
    const row = rows.get(id)
    if (!row || row.state !== 'draft') {
      refused.push({ id, reason: 'not-draft' })
      continue
    }
    if (row.starts_at <= at) {
      refused.push({ id, reason: 'started' })
      continue
    }
    const why = await whyNotFree(row.space_id, row.starts_at, row.ends_at, row.id)
    const clashesHere = row.exclusive && scheduled.some(o => o.space_id === row.space_id && o.starts_at < row.ends_at + gap && o.ends_at + gap > row.starts_at)
    if (why || clashesHere) {
      refused.push({ id, reason: why?.code === 'core.performance.closed' ? 'closed' : 'space-taken' })
      continue
    }
    unit.add(sql`UPDATE core_performances SET state = 'scheduled'
      WHERE id = ${row.id} AND state = 'draft' AND starts_at > ${at}
        AND ${noClash(row.space_id, row.starts_at, row.ends_at, { except: row.id, gap })} AND ${assertNoBlockingClosure(row.space_id, row.starts_at, row.ends_at)}`).expect(1, CHANGED)
    scheduled.push(row)
  }
  if (scheduled.length) {
    for (const productionId of new Set(scheduled.map(r => r.production_id))) syncProductionDates(unit, productionId)
    unit.audit(scheduled.map(r => ({ action: 'state' as const, record: record(r.id), detail: { from: 'draft', to: 'scheduled' } })))
    unit.announce('core.performance.scheduled', scheduled.map(r => ({ payload: { performanceId: r.id, productionId: r.production_id, reinstated: false }, record: record(r.id) })))
  }
  return { scheduled: scheduled.map(r => r.id), refused }
}

/**
 * C-68: a new space and time. A draft moves freely, to any venue's space; a scheduled one
 * passes the same guards as a move by hand and announces the same events.
 */
export async function movePerformance(unit: UnitView, id: string, to: { spaceId: string, startsAt: number, endsAt: number }, actor: Actor): Promise<{ warnings: string[] }> {
  const space = await first<{ venue_id: string }>('SELECT venue_id FROM core_spaces WHERE id = ?', to.spaceId)
  if (!space) refuse(SPACE_UNSUITABLE.code, SPACE_UNSUITABLE.reason, { status: 422 })
  return updatePerformance(unit, id, { venueId: space.venue_id, spaceId: to.spaceId, startsAt: to.startsAt, endsAt: to.endsAt }, actor)
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
      AND ${noClash(row.space_id, row.starts_at, row.ends_at, { except: row.id, gap: await turnaroundMs() })} AND ${assertNoBlockingClosure(row.space_id, row.starts_at, row.ends_at)}`).expect(1, CHANGED)
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
  if (patch.shape !== undefined && patch.shape !== row.shape && row.state !== 'draft')
    refuse('core.performance.shape-fixed', 'Only a draft performance can change between timed and drop-in.', { status: 409, fields: { shape: 'Make a new performance instead.' } })
  const shape = patch.shape ?? row.shape
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
  if (shape === 'drop-in') Object.assign(next, { doorsAt: null, intervalCount: 0, intervalMinutes: null })
  checkTimes(next.startsAt, next.endsAt, next.doorsAt)
  if (shape === 'drop-in') await checkDropIn(next.startsAt, next.endsAt)
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
    guards.push(noClash(next.spaceId, next.startsAt, next.endsAt, { except: id, gap: await turnaroundMs() }), assertNoBlockingClosure(next.spaceId, next.startsAt, next.endsAt))
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
      external_booking_url = ${next.externalBookingUrl}, shape = ${shape}
    WHERE id = ${id} AND state = ${row.state} AND starts_at = ${row.starts_at} AND space_id = ${row.space_id}${guards.length ? sql` AND ${sql.join(guards, sql` AND `)}` : sql``}`)
    .expect(1, moved && !scheduled ? SPACE_UNSUITABLE : CHANGED)
  if (scheduled && retimed) syncProductionDates(unit, row.production_id)
  unit.audit({ action: 'update', record: record(id), detail: { retimed, moved, capacity: recapacitied, ...(shape !== row.shape ? { shape } : {}) } })
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

/**
 * C-55: the staging effects this performance does not use, replacing the list. Each must be one of
 * the production's effects; the audience is told those effects are not used at this performance.
 */
export async function setPerformanceEffectExceptions(unit: UnitView, id: string, termIds: string[]): Promise<void> {
  const row = await performanceRow(id)
  if (row.state === 'completed') refuse('core.performance.completed', 'A completed performance cannot be changed.', { status: 409 })
  if (new Set(termIds).size !== termIds.length) refuse('core.performance.effects-repeated', 'Each staging effect can be listed once.', { status: 422 })
  unit.add(sql`DELETE FROM core_performance_effect_exceptions WHERE performance_id = ${id}`)
  for (const termId of termIds) {
    unit.add(sql`INSERT INTO core_performance_effect_exceptions (performance_id, term_id)
      SELECT ${id}, ${termId} WHERE EXISTS (SELECT 1 FROM core_production_effects WHERE production_id = ${row.production_id} AND term_id = ${termId})`)
      .expect(1, { code: 'core.performance.effects-unknown', reason: 'Choose from the staging effects the production lists.' })
  }
  unit.audit({ action: 'update', record: record(id), detail: { effectsOff: termIds.length } })
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
