import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import { addDays } from './series'
import { saysDay } from './when'
import type { ConstraintRefusal } from './constraint-refusal'

// I-107. A period close is a fact appended (`period_locks`), never a mutation of the entries it
// covers; `london_day` format throughout, the same calendar grouping month and season totals use.

export const PERIOD_LOCK_ACTIONS = ['CLOSED', 'REOPENED'] as const
export type PeriodLockAction = (typeof PERIOD_LOCK_ACTIONS)[number]

// The name of the trigger that refuses a ledger write into a closed period, named once here so
// the catch in server/utils/ledger.ts and the migration that creates it cannot drift apart.
export const CLOSED_PERIOD_TRIGGER = 'ledger_entries_refuses_a_closed_period'

const londonDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is YYYY-MM-DD')

// A named term, the range I-105's own TERM selector reads. A season needs none: its range is
// computed, never stored (architecture.md).
export const defineTermForm = z.object({
  label: z.string().trim().min(1, 'Give the term a label').max(120, 'Keep the label to 120 characters'),
  fromDay: londonDay,
  toDay: londonDay,
}).refine(input => input.toDay >= input.fromDay, { path: ['toDay'], message: 'A term cannot end before it starts' })

export type DefineTermInput = z.output<typeof defineTermForm>

export interface Period {
  id: string
  label: string
  fromDay: string
  toDay: string
  createdBy: string
  createdByName: string
  createdAt: number
}

export const closePeriodForm = z.object({
  fromDay: londonDay,
  toDay: londonDay,
  label: z.string().trim().min(1, 'Give the period a label').max(120, 'Keep the label to 120 characters').optional(),
}).refine(input => input.toDay >= input.fromDay, { path: ['toDay'], message: 'A period cannot end before it starts' })

export type ClosePeriodInput = z.output<typeof closePeriodForm>

// The typed confirmation (A-123's own pattern): the range being reopened, resubmitted, so a
// stale screen cannot reopen a different period than the one the treasurer is looking at.
export const reopenPeriodForm = z.object({
  confirmFromDay: londonDay,
  confirmToDay: londonDay,
})

export type ReopenPeriodInput = z.output<typeof reopenPeriodForm>

// What a history row governs now, by the rule the ledger's trigger applies to each day (0129).
export const LOCK_STANDINGS = ['CLOSED', 'PARTLY_CLOSED', 'REOPENED', 'SUPERSEDED'] as const
export type LockStanding = (typeof LOCK_STANDINGS)[number]

export interface PeriodLock {
  id: string
  fromDay: string
  toDay: string
  label: string | null
  action: PeriodLockAction
  actorId: string
  actorName: string
  createdAt: number
  standing: LockStanding
}

type LockRange = Pick<PeriodLock, 'id' | 'fromDay' | 'toDay' | 'action'>

// The row governing a day is the newest covering it; the list is newest first.
function governing<T extends LockRange>(locks: readonly T[], day: string): T | undefined {
  return locks.find(lock => lock.fromDay <= day && day <= lock.toDay)
}

// Who governs a day changes only where some row starts or ends, so those days stand for the rest.
function probeDays(locks: readonly LockRange[], fromDay: string, toDay: string): string[] {
  const inside = (day: string): boolean => day > fromDay && day <= toDay
  const edges = locks.flatMap(lock => [lock.fromDay, addDays(lock.toDay, 1)]).filter(inside)
  return [...new Set([fromDay, ...edges])]
}

function governs(locks: readonly LockRange[], lock: LockRange, fromDay: string, toDay: string): { any: boolean, all: boolean } {
  const owned = probeDays(locks, fromDay, toDay).map(day => governing(locks, day)?.id === lock.id)
  return { any: owned.some(Boolean), all: owned.every(Boolean) }
}

// Each row's standing, keyed by id: the history and the ledger answer "is this closed" one way.
export function lockStandings(locks: readonly LockRange[]): Record<string, LockStanding> {
  return Object.fromEntries(locks.map((lock) => {
    const { any, all } = governs(locks, lock, lock.fromDay, lock.toDay)
    if (!any) return [lock.id, 'SUPERSEDED']
    if (lock.action === 'REOPENED') return [lock.id, 'REOPENED']
    return [lock.id, all ? 'CLOSED' : 'PARTLY_CLOSED']
  }))
}

// The closes still in force over any day of a range: what a new close of it would overlap.
export function closedLocksWithin<T extends LockRange>(locks: readonly T[], fromDay: string, toDay: string): T[] {
  return locks.filter(lock => lock.action === 'CLOSED' && governs(locks, lock, fromDay, toDay).any)
}

const STANDING_WORDING: Record<LockStanding, string> = {
  CLOSED: 'Closed',
  PARTLY_CLOSED: 'Partly closed',
  REOPENED: 'Reopened',
  SUPERSEDED: 'no longer in force',
}

// What the row did, and whether it still governs: "Closed, no longer in force" once reopened.
export function saysLockStanding(lock: Pick<PeriodLock, 'action' | 'standing'>): string {
  if (lock.standing !== 'SUPERSEDED') return STANDING_WORDING[lock.standing]
  return `${lock.action === 'CLOSED' ? 'Closed' : 'Reopened'}, ${STANDING_WORDING.SUPERSEDED}`
}

// A close still in force that a new range would overlap, named so the screen can say which.
export interface ClosedOverlap {
  id: string
  fromDay: string
  toDay: string
  label: string | null
}

export interface BlockingConditions {
  unreconciledNights: string[]
  openVarianceNights: string[]
  alreadyClosed: ClosedOverlap[]
}

function saysRange(lock: ClosedOverlap): string {
  const range = `${saysDay(lock.fromDay, { year: true })} to ${saysDay(lock.toDay, { year: true })}`
  return lock.label ? `${lock.label} (${range})` : range
}

// Why a close was refused: the closes in force it overlaps, or a history that moved under it.
export function saysClosedOverlap(overlaps: readonly ClosedOverlap[]): string {
  if (overlaps.length === 0) return 'The close history changed while you were closing. Reload the page and try again.'
  return `Some of these days are already closed: ${overlaps.map(saysRange).join(', ')}. Close only the days outside it, or reopen it first.`
}

export function hasBlockingConditions(blocking: BlockingConditions): boolean {
  return blocking.unreconciledNights.length > 0 || blocking.openVarianceNights.length > 0
}

const PERIOD_LOCK_CONSTRAINT_REFUSALS: ConstraintRefusal[] = [
  { violated: 'period_locks_range_order', says: 'A period cannot end before it starts' },
  { violated: 'periods_range_order', says: 'A term cannot end before it starts' },
]

export function periodLockConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(PERIOD_LOCK_CONSTRAINT_REFUSALS, error)
}
