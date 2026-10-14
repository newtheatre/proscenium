import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { nightsMissingAReading, nightsWithOpenVariance } from './night-reconciliation'
import { auditEntry } from '#shared/utils/audit'
import { closedLocksWithin, lockStandings } from '#shared/utils/period-locks'
import type { BlockingConditions, ClosePeriodInput, ClosedOverlap, DefineTermInput, Period, PeriodLock, PeriodLockAction } from '#shared/utils/period-locks'
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

// A term's own definition, read by the money dashboard's TERM selector (I-105) as well as by
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
// term. A label or a range already named is refused on the statement itself (0129).
export async function defineTerm(input: DefineTermInput, actorId: string): Promise<{ id: string, applied: boolean }> {
  const id = newId()
  const statement = db.all<{ id: string }>(sql`
    INSERT INTO periods (id, label, from_day, to_day, created_by)
    SELECT ${id}, ${input.label}, ${input.fromDay}, ${input.toDay}, ${actorId}
    WHERE NOT EXISTS (
      SELECT 1 FROM periods
      WHERE lower(label) = lower(${input.label}) OR (from_day = ${input.fromDay} AND to_day = ${input.toDay})
    )
    RETURNING id
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

// A term is only a name for a range: nothing references it, so a mistaken one can go (0129).
export async function removeTerm(id: string, actorId: string): Promise<boolean> {
  const [term] = await db.all<{ label: string, fromDay: string, toDay: string }>(sql`
    SELECT label, from_day AS fromDay, to_day AS toDay FROM periods WHERE id = ${id}
  `)
  if (!term) return false
  const statement = db.all<{ id: string }>(sql`DELETE FROM periods WHERE id = ${id} RETURNING id`)
  const entry = auditEntry({
    actorId,
    action: 'finance.period.removed',
    target: `period:${id}`,
    detail: { label: term.label, fromDay: term.fromDay, toDay: term.toDay },
  })
  return auditedWrite(statement, entry)
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
    ORDER BY l.created_at DESC, l.rowid DESC
  `
}

export async function periodLocksHistory(): Promise<PeriodLock[]> {
  const rows = await db.all<PeriodLockRow>(periodLocksHistoryQuery())
  const standings = lockStandings(rows)
  return rows.map(row => ({ ...row, standing: standings[row.id]! }))
}

export async function periodLockById(id: string): Promise<{ fromDay: string, toDay: string, label: string | null, action: PeriodLockAction } | null> {
  const [row] = await db.all<{ fromDay: string, toDay: string, label: string | null, action: PeriodLockAction }>(sql`
    SELECT from_day AS fromDay, to_day AS toDay, label, action FROM period_locks WHERE id = ${id}
  `)
  return row ?? null
}

// The newest row covering a day, ordered exactly as the ledger's own trigger orders it.
function governingLockOf(day: SQL, column: 'id' | 'action'): SQL {
  return sql`(
    SELECT ${sql.raw(`g.${column}`)} FROM period_locks g
    WHERE ${day} BETWEEN g.from_day AND g.to_day
    ORDER BY g.created_at DESC, g.rowid DESC
    LIMIT 1
  )`
}

// The days of a range where the governing row can change: its first day, and every row's edges
// inside it. Bound once each, whatever the history holds (0129).
function probeDaysOf(fromDay: string, toDay: string): SQL {
  return sql`(
    SELECT ${fromDay} AS day
    UNION SELECT from_day FROM period_locks WHERE from_day > ${fromDay} AND from_day <= ${toDay}
    UNION SELECT date(to_day, '+1 day') FROM period_locks
      WHERE date(to_day, '+1 day') > ${fromDay} AND date(to_day, '+1 day') <= ${toDay}
  )`
}

// True while any day of the range is closed: the predicate a new close of it is refused on.
export function anyDayClosedQuery(fromDay: string, toDay: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${probeDaysOf(fromDay, toDay)} probe
    WHERE ${governingLockOf(sql`probe.day`, 'action')} = 'CLOSED'
  )`
}

// True while the lock still governs some day of its own range, so reopening it changes something.
function lockGovernsQuery(lockId: string, fromDay: string, toDay: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${probeDaysOf(fromDay, toDay)} probe
    WHERE ${governingLockOf(sql`probe.day`, 'id')} = ${lockId}
  )`
}

// The row governing one day is the latest covering it, however many times that range has been
// closed and reopened. Latest is by second, then by rowid: an id is random (#1567).
function currentActionForDayQuery(day: string): SQL {
  return sql`
    SELECT action FROM period_locks
    WHERE ${day} BETWEEN from_day AND to_day
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `
}

export async function isDayLocked(day: string): Promise<boolean> {
  const [row] = await db.all<{ action: PeriodLockAction }>(currentActionForDayQuery(day))
  return row?.action === 'CLOSED'
}

// Whether a whole range is closed (I-108): the latest lock fully containing it, unless a later
// reopen touches any of its days. Closed in pieces, or reopened in part, reads as open.
export function rangeClosedQuery(fromDay: string, toDay: string): SQL {
  return sql`
    WITH cover AS (
      SELECT action, created_at, rowid AS seq FROM period_locks
      WHERE from_day <= ${fromDay} AND to_day >= ${toDay}
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    )
    SELECT cover.action AS action, EXISTS (
      SELECT 1 FROM period_locks later
      WHERE later.action = 'REOPENED' AND later.from_day <= ${toDay} AND later.to_day >= ${fromDay}
        AND (later.created_at > cover.created_at OR (later.created_at = cover.created_at AND later.rowid > cover.seq))
    ) AS reopenedSince
    FROM cover
  `
}

export async function isRangeClosed(fromDay: string, toDay: string): Promise<boolean> {
  const [row] = await db.all<{ action: PeriodLockAction, reopenedSince: number }>(rangeClosedQuery(fromDay, toDay))
  return row?.action === 'CLOSED' && !row.reopenedSince
}

// Criterion 5: what closing warns about before it proceeds. Nights, filtered to the range by
// label, since that is what the reconciliation record this reads is keyed on (F-118).
export async function blockingConditionsFor(fromDay: string, toDay: string): Promise<BlockingConditions> {
  const [missing, openVariance, history] = await Promise.all([nightsMissingAReading(), nightsWithOpenVariance(), db.all<PeriodLockRow>(periodLocksHistoryQuery())])
  const inRange = (night: string): boolean => night >= fromDay && night <= toDay
  return {
    unreconciledNights: missing.map(row => row.night).filter(inRange),
    openVarianceNights: openVariance.map(row => row.night).filter(inRange),
    alreadyClosed: closedLocksWithin(history, fromDay, toDay).map(({ id, fromDay, toDay, label }) => ({ id, fromDay, toDay, label })),
  }
}

// Criterion 1: blocking conditions are advisory, not re-checked here; a close over a day already
// closed is refused on its own statement, and `overlaps` names what refused it (0129).
export async function closePeriod(input: ClosePeriodInput, actorId: string): Promise<{ id: string, applied: boolean, overlaps: ClosedOverlap[] }> {
  const id = newId()
  const statement = db.all<{ id: string }>(sql`
    INSERT INTO period_locks (id, from_day, to_day, label, action, actor_id)
    SELECT ${id}, ${input.fromDay}, ${input.toDay}, ${input.label ?? null}, 'CLOSED', ${actorId}
    WHERE NOT ${anyDayClosedQuery(input.fromDay, input.toDay)}
    RETURNING id
  `)
  const entry = auditEntry({
    actorId,
    action: 'finance.period.closed',
    target: `period-lock:${id}`,
    detail: { fromDay: input.fromDay, toDay: input.toDay },
  })
  const applied = await auditedWrite(statement, entry)
  if (applied) return { id, applied, overlaps: [] }
  const history = await db.all<PeriodLockRow>(periodLocksHistoryQuery())
  const overlaps = closedLocksWithin(history, input.fromDay, input.toDay).map(({ id, fromDay, toDay, label }) => ({ id, fromDay, toDay, label }))
  return { id, applied, overlaps }
}

// Criterion 4: reopening is a new row, not an edit of the close it reopens; the range and label
// come from the lock itself, and it applies only while that lock still governs a day (0129).
export async function reopenPeriod(lockId: string, actorId: string): Promise<{ id: string, applied: boolean } | null> {
  const lock = await periodLockById(lockId)
  if (!lock || lock.action !== 'CLOSED') return null

  const id = newId()
  const statement = db.all<{ id: string }>(sql`
    INSERT INTO period_locks (id, from_day, to_day, label, action, actor_id)
    SELECT ${id}, ${lock.fromDay}, ${lock.toDay}, ${lock.label}, 'REOPENED', ${actorId}
    WHERE ${lockGovernsQuery(lockId, lock.fromDay, lock.toDay)}
    RETURNING id
  `)
  const entry = auditEntry({
    actorId,
    action: 'finance.period.reopened',
    target: `period-lock:${id}`,
    detail: { fromDay: lock.fromDay, toDay: lock.toDay, reopens: lockId },
  })
  if (!(await auditedWrite(statement, entry))) return null
  return { id, applied: true }
}
