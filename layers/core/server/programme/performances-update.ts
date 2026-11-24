// Changing a performance (C-07, C-68): a new time, place, capacity or detail, with the same guards as
// scheduling when it is already scheduled. Split from performances.ts, which it reads from.
import { sql, type SQL } from 'drizzle-orm'
import { first, nowMs, refuse } from '#kit'
import type { Actor, UnitView } from '#kit'
import { assertNoBlockingClosure } from '../places/closures'
import { operatingDayOf } from '../calendar'
import { shiftLineUp } from './line-ups'
import { checkDropIn, checkTimes, noClash, runGuards, spaceFits, turnaroundMs, warningsFor, whyNotFree } from './performances-checks'
import { CHANGED, MINUTE, performanceRow, record, SPACE_UNSUITABLE, syncProductionDates, type PerformancePatch, type PerformanceRow } from './performances'

interface Next {
  venueId: string
  spaceId: string
  startsAt: number
  endsAt: number
  doorsAt: number | null
  intervalCount: number | null
  intervalMinutes: number | null
  capacity: number | null
  label: string | null
  externalBookingUrl: string | null
}

/** Which kinds of change a patch makes. */
interface Changes { retimed: boolean, moved: boolean, recapacitied: boolean }

const pick = <T>(patched: T | undefined, kept: T): T => patched === undefined ? kept : patched

function assertChangeable(row: PerformanceRow, patch: PerformancePatch): void {
  if (row.state === 'completed') refuse('core.performance.completed', 'A completed performance cannot be changed.', { status: 409 })
  if (row.state === 'cancelled') refuse('core.performance.cancelled', 'A cancelled performance cannot be changed.', { status: 409, remedy: 'Reinstate it first.' })
  if (patch.shape !== undefined && patch.shape !== row.shape && row.state !== 'draft')
    refuse('core.performance.shape-fixed', 'Only a draft performance can change between timed and drop-in.', { status: 409, fields: { shape: 'Make a new performance instead.' } })
}

function nextDoors(row: PerformanceRow, patch: PerformancePatch, startsAt: number): number | null {
  if (patch.doorsAt !== undefined) return patch.doorsAt
  if (patch.doorsBeforeMinutes != null) return startsAt - patch.doorsBeforeMinutes * MINUTE
  // Moving the start moves doors with it, unless the patch says where doors are.
  if (patch.startsAt !== undefined && row.doors_at !== null) return row.doors_at + (startsAt - row.starts_at)
  return row.doors_at
}

function nextOf(row: PerformanceRow, patch: PerformancePatch): Next {
  const startsAt = patch.startsAt ?? row.starts_at
  const next: Next = {
    venueId: patch.venueId ?? row.venue_id,
    spaceId: patch.spaceId ?? row.space_id,
    startsAt,
    // A running time keeps the end that long after the (new) start; a lead does the same for doors.
    endsAt: patch.endsAt ?? (patch.runningMinutes ? startsAt + patch.runningMinutes * MINUTE : row.ends_at),
    doorsAt: nextDoors(row, patch, startsAt),
    intervalCount: pick(patch.intervalCount, row.interval_count),
    intervalMinutes: pick(patch.intervalMinutes, row.interval_minutes),
    capacity: pick(patch.capacity, row.capacity),
    label: pick(patch.label, row.label),
    externalBookingUrl: pick(patch.externalBookingUrl, row.external_booking_url),
  }
  return (patch.shape ?? row.shape) === 'drop-in' ? { ...next, doorsAt: null, intervalCount: 0, intervalMinutes: null } : next
}

/** The predicates a change puts on its statement, after the reads that choose the words of a refusal. */
async function guardsOf(row: PerformanceRow, next: Next, change: Changes): Promise<SQL[]> {
  const guards: SQL[] = []
  if (change.moved) guards.push(spaceFits(next.venueId, next.spaceId))
  if (row.state === 'scheduled' && (change.retimed || change.moved)) {
    if (next.startsAt <= nowMs()) refuse('core.performance.started', 'A performance cannot be moved to a time that has passed.', { status: 409 })
    const why = await whyNotFree(next.spaceId, next.startsAt, next.endsAt, row.id)
    if (why) refuse(why.code, why.reason, { status: 409 })
    guards.push(noClash(next.spaceId, next.startsAt, next.endsAt, { except: row.id, gap: await turnaroundMs() }), assertNoBlockingClosure(next.spaceId, next.startsAt, next.endsAt))
  }
  return guards
}

/** Every module may refuse a change to a scheduled performance. */
async function askModules(row: PerformanceRow, next: Next, change: Changes, actor: Actor): Promise<void> {
  if (row.state !== 'scheduled') return
  const to = { startsAt: next.startsAt, endsAt: next.endsAt, venueId: next.venueId, spaceId: next.spaceId, capacity: next.capacity }
  if (change.retimed) await runGuards({ record: { type: 'core.performance', id: row.id }, kind: 'reschedule', to }, actor)
  if (change.moved) await runGuards({ record: { type: 'core.performance', id: row.id }, kind: 'move', to }, actor)
  if (change.recapacitied) await runGuards({ record: { type: 'core.performance', id: row.id }, kind: 'capacity', to }, actor)
}

/** Each kind of change to a scheduled performance, announced with the old and new values. */
function announceChanges(unit: UnitView, row: PerformanceRow, next: Next, change: Changes): void {
  if (row.state !== 'scheduled') return
  const target = { record: record(row.id) }
  if (change.retimed)
    unit.announce('core.performance.rescheduled', { performanceId: row.id, productionId: row.production_id, oldStartsAt: row.starts_at, oldEndsAt: row.ends_at, startsAt: next.startsAt, endsAt: next.endsAt }, target)
  if (change.moved)
    unit.announce('core.performance.moved', { performanceId: row.id, productionId: row.production_id, oldVenueId: row.venue_id, oldSpaceId: row.space_id, venueId: next.venueId, spaceId: next.spaceId }, target)
  if (change.recapacitied)
    unit.announce('core.performance.capacity-changed', { performanceId: row.id, productionId: row.production_id, oldCapacity: row.capacity, capacity: next.capacity }, target)
}

/**
 * C-07: a new time, place, capacity or detail. On a scheduled performance a new time or place
 * passes the same guards as scheduling, every module may refuse it, and each kind of change is
 * announced with the old and new values. A completed or cancelled performance cannot change.
 */
export async function updatePerformance(unit: UnitView, id: string, patch: PerformancePatch, actor: Actor): Promise<{ warnings: string[] }> {
  const row = await performanceRow(id)
  assertChangeable(row, patch)
  const shape = patch.shape ?? row.shape
  const next = nextOf(row, patch)
  checkTimes(next.startsAt, next.endsAt, next.doorsAt)
  if (shape === 'drop-in') await checkDropIn(next.startsAt, next.endsAt)
  const change = {
    retimed: next.startsAt !== row.starts_at || next.endsAt !== row.ends_at,
    moved: next.spaceId !== row.space_id || next.venueId !== row.venue_id,
    recapacitied: next.capacity !== row.capacity,
  }
  const scheduled = row.state === 'scheduled'
  const guards = await guardsOf(row, next, change)
  await askModules(row, next, change, actor)
  const day = change.retimed ? await operatingDayOf(next.startsAt) : row.operating_day
  unit.add(sql`UPDATE core_performances SET venue_id = ${next.venueId}, space_id = ${next.spaceId}, starts_at = ${next.startsAt}, ends_at = ${next.endsAt},
      doors_at = ${next.doorsAt}, operating_day = ${day}, interval_count = ${next.intervalCount}, interval_minutes = ${next.intervalMinutes}, capacity = ${next.capacity}, label = ${next.label},
      external_booking_url = ${next.externalBookingUrl}, shape = ${shape}
    WHERE id = ${id} AND state = ${row.state} AND starts_at = ${row.starts_at} AND space_id = ${row.space_id}${guards.length ? sql` AND ${sql.join(guards, sql` AND `)}` : sql``}`)
    .expect(1, change.moved && !scheduled ? SPACE_UNSUITABLE : CHANGED)
  shiftLineUp(unit, id, next.startsAt - row.starts_at)
  if (scheduled && change.retimed) syncProductionDates(unit, row.production_id)
  unit.audit({ action: 'update', record: record(id), detail: { retimed: change.retimed, moved: change.moved, capacity: change.recapacitied, ...(shape !== row.shape ? { shape } : {}) } })
  announceChanges(unit, row, next, change)
  return { warnings: scheduled && (change.retimed || change.moved) ? await warningsFor(next.spaceId, next.startsAt, next.endsAt) : [] }
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
