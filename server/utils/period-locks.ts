import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { nightsMissingAReading, nightsWithOpenVariance } from './night-reconciliation'
import { auditEntry } from '#shared/utils/audit'
import type { ClosePeriodInput, DefineTermInput, Period, PeriodLock, PeriodLockAction } from '#shared/utils/period-locks'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'

// I-107. `ledger_entries_refuses_a_closed_period` is the actual enforcement; everything here is
// the record of what was closed and by whom, and the warning shown before closing it.

interface PeriodRow {
  id: string
  label: string
  fromDay: string
  toDay: string
  createdBy: string
  createdByName: string
  createdAt: number
}

// A term's own definition, read by the season dashboard's TERM selector (I-105) as well as by
// closing one: the range a client submits for `kind: 'TERM'` is exactly what this lists.
export function periodsQuery(): SQL {
  return sql`
    SELECT p.id AS id, p.label AS label, p.from_day AS fromDay, p.to_day AS toDay,
           p.created_by AS createdBy, u.name AS createdByName, p.created_at AS createdAt
    FROM periods p
    JOIN users u ON u.id = p.created_by
    ORDER BY p.from_day DESC
  `
}

export async function periodsList(): Promise<Period[]> {
  return db.all<PeriodRow>(periodsQuery())
}

// Criterion: a term is named once and never redefined; correcting a mistaken range is a fresh
// term, the same append-only reasoning the rest of this module already keeps.
export async function defineTerm(input: DefineTermInput, actorId: string): Promise<{ id: string, applied: boolean }> {
  const id = newId()
  const statement = db.run(sql`
    INSERT INTO periods (id, label, from_day, to_day, created_by) VALUES (${id}, ${input.label}, ${input.fromDay}, ${input.toDay}, ${actorId})
  `)
  const entry = auditEntry({
    actorId,
    action: 'finance.period.defined',
    target: `period:${id}`,
    detail: { label: input.label, fromDay: input.fromDay, toDay: input.toDay },
  })
  const applied = await auditedWrite(statement, entry)
  return { id, applied }
}

interface PeriodLockRow {
  id: string
  fromDay: string
  toDay: string
  label: string | null
  action: PeriodLockAction
  actorId: string
  actorName: string
  createdAt: number
}

export function periodLocksHistoryQuery(): SQL {
  return sql`
    SELECT l.id AS id, l.from_day AS fromDay, l.to_day AS toDay, l.label AS label, l.action AS action,
           l.actor_id AS actorId, u.name AS actorName, l.created_at AS createdAt
    FROM period_locks l
    JOIN users u ON u.id = l.actor_id
    ORDER BY l.created_at DESC
  `
}

export async function periodLocksHistory(): Promise<PeriodLock[]> {
  return db.all<PeriodLockRow>(periodLocksHistoryQuery())
}

export async function periodLockById(id: string): Promise<{ fromDay: string, toDay: string } | null> {
  const [row] = await db.all<{ fromDay: string, toDay: string }>(sql`
    SELECT from_day AS fromDay, to_day AS toDay FROM period_locks WHERE id = ${id}
  `)
  return row ?? null
}

// The row governing one day is the latest covering it, however many times that range has been
// closed and reopened; a handful of ranges in a season's history, never a scan (0001).
function currentActionForDayQuery(day: string): SQL {
  return sql`
    SELECT action FROM period_locks
    WHERE ${day} BETWEEN from_day AND to_day
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `
}

export async function isDayLocked(day: string): Promise<boolean> {
  const [row] = await db.all<{ action: PeriodLockAction }>(currentActionForDayQuery(day))
  return row?.action === 'CLOSED'
}

// Whether a whole range is closed (I-108): the latest lock whose own range fully contains this
// one. A range closed in two or more pieces reads as open rather than guessed at.
function rangeCoveredByQuery(fromDay: string, toDay: string): SQL {
  return sql`
    SELECT action FROM period_locks
    WHERE from_day <= ${fromDay} AND to_day >= ${toDay}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `
}

export async function isRangeClosed(fromDay: string, toDay: string): Promise<boolean> {
  const [row] = await db.all<{ action: PeriodLockAction }>(rangeCoveredByQuery(fromDay, toDay))
  return row?.action === 'CLOSED'
}

// Criterion 5: what closing warns about before it proceeds. Nights, filtered to the range by
// label, since that is what the reconciliation record this reads is keyed on (F-118).
export async function blockingConditionsFor(fromDay: string, toDay: string): Promise<{ unreconciledNights: string[], openVarianceNights: string[] }> {
  const [missing, openVariance] = await Promise.all([nightsMissingAReading(), nightsWithOpenVariance()])
  const inRange = (night: string): boolean => night >= fromDay && night <= toDay
  return {
    unreconciledNights: missing.map(row => row.night).filter(inRange),
    openVarianceNights: openVariance.map(row => row.night).filter(inRange),
  }
}

function lockStatement(input: ClosePeriodInput, action: PeriodLockAction, actorId: string, id = newId()): BatchItem<'sqlite'> {
  return db.run(sql`
    INSERT INTO period_locks (id, from_day, to_day, label, action, actor_id)
    VALUES (${id}, ${input.fromDay}, ${input.toDay}, ${input.label ?? null}, ${action}, ${actorId})
  `)
}

// Criterion 1: closing records who and when and audits itself; blocking conditions are the
// caller's own preview to show first, not re-checked here, since a warning is not a refusal.
export async function closePeriod(input: ClosePeriodInput, actorId: string): Promise<{ id: string, applied: boolean }> {
  const id = newId()
  const entry = auditEntry({
    actorId,
    action: 'finance.period.closed',
    target: `period-lock:${id}`,
    detail: { fromDay: input.fromDay, toDay: input.toDay },
  })
  const applied = await auditedWrite(lockStatement(input, 'CLOSED', actorId, id), entry)
  return { id, applied }
}

// Criterion 4: reopening is a new row, not an edit of the close it reopens; the range comes from
// the lock being reopened, so what reopens is exactly what was closed, never a caller's own retype.
export async function reopenPeriod(lockId: string, actorId: string): Promise<{ id: string, applied: boolean } | null> {
  const [lock] = await db.all<{ fromDay: string, toDay: string }>(sql`
    SELECT l.from_day AS fromDay, l.to_day AS toDay FROM period_locks l
    WHERE l.id = ${lockId} AND l.action = 'CLOSED'
      AND NOT EXISTS (
        SELECT 1 FROM period_locks later
        WHERE later.from_day = l.from_day AND later.to_day = l.to_day AND later.created_at > l.created_at
      )
  `)
  if (!lock) return null

  const id = newId()
  const entry = auditEntry({
    actorId,
    action: 'finance.period.reopened',
    target: `period-lock:${id}`,
    detail: { fromDay: lock.fromDay, toDay: lock.toDay, reopens: lockId },
  })
  const applied = await auditedWrite(lockStatement({ fromDay: lock.fromDay, toDay: lock.toDay }, 'REOPENED', actorId, id), entry)
  return { id, applied }
}
