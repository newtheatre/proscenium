import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import type { ConstraintRefusal } from './constraint-refusal'

// I-107. A period close is a fact appended (`period_locks`), never a mutation of the entries it
// covers; `london_day` format throughout, the same calendar grouping month and season totals use.

export const PERIOD_LOCK_ACTIONS = ['CLOSED', 'REOPENED'] as const
export type PeriodLockAction = (typeof PERIOD_LOCK_ACTIONS)[number]

// The name of the trigger that refuses a ledger write into a closed period, named once here so
// the catch in server/utils/ledger.ts and the migration that creates it cannot drift apart.
export const CLOSED_PERIOD_TRIGGER = 'ledger_entries_refuses_a_closed_period'

const londonDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is YYYY-MM-DD')

export const closePeriodForm = z.object({
  fromDay: londonDay,
  toDay: londonDay,
  label: z.string().trim().min(1).max(120).optional(),
}).refine(input => input.toDay >= input.fromDay, { path: ['toDay'], message: 'A period cannot end before it starts' })

export type ClosePeriodInput = z.output<typeof closePeriodForm>

// The typed confirmation (A-123's own pattern): the range being reopened, resubmitted, so a
// stale screen cannot reopen a different period than the one the treasurer is looking at.
export const reopenPeriodForm = z.object({
  confirmFromDay: londonDay,
  confirmToDay: londonDay,
})

export type ReopenPeriodInput = z.output<typeof reopenPeriodForm>

export interface PeriodLock {
  id: string
  fromDay: string
  toDay: string
  label: string | null
  action: PeriodLockAction
  actorId: string
  actorName: string
  createdAt: number
}

export interface BlockingConditions {
  unreconciledNights: string[]
  openVarianceNights: string[]
}

export function hasBlockingConditions(blocking: BlockingConditions): boolean {
  return blocking.unreconciledNights.length > 0 || blocking.openVarianceNights.length > 0
}

const PERIOD_LOCK_CONSTRAINT_REFUSALS: ConstraintRefusal[] = [
  { violated: 'period_locks_range_order', says: 'A period cannot end before it starts' },
]

export function periodLockConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(PERIOD_LOCK_CONSTRAINT_REFUSALS, error)
}
