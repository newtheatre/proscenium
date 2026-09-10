import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { createError } from 'h3'
import { newId } from './accounts'
import { performanceNight } from './performances'
import { nightReconciliation } from './reconciliation'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import type { ExpectedByKind, NightExpected, OutstandingNight, RecordZReadingInput, ZReading } from '#shared/utils/night-reconciliation'
import type { SQL } from 'drizzle-orm'

// I-104's own whole-night figure, built from F-118's `nightReconciliation` rather than a second
// account of the same figures; the only new query here is the desk's own itemised breakdown.

function windowOf(night: string): { fromAt: number, toAt: number } {
  const { from, to } = showNightBounds(night)
  return { fromAt: Math.floor(from.getTime() / 1000), toAt: Math.floor(to.getTime() / 1000) }
}

// Desk collections, walk-ups and pass sales, split by kind (criterion 1): the desk-side detail
// `deskTakingsQuery` (F-118) deliberately leaves as one total.
export function deskByKindQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT ll.kind AS kind, coalesce(sum(ll.amount_pence), 0) AS totalPence
    FROM ledger_lines ll JOIN ledger_entries le ON le.id = ll.entry_id
    WHERE le.source = 'DESK' AND le.tender = 'CARD'
      AND le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}
    GROUP BY ll.kind
  `
}

// The desk's own foregone value, the same shape I-103 reports and F-118's own `compsQuery` /
// `discountsQuery` compute for the bar half of the same night.
export function deskForegoneQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT
      coalesce(sum(CASE WHEN le.tender = 'COMP' THEN ll.unit_price_pence * ll.qty ELSE 0 END), 0) AS compsPence,
      coalesce(sum(ll.discount_pence), 0) AS discountsPence
    FROM ledger_lines ll JOIN ledger_entries le ON le.id = ll.entry_id
    WHERE le.source = 'DESK'
      AND le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}
  `
}

export async function nightExpected(night: string): Promise<NightExpected> {
  const [reconciliation, deskByKind, [deskForegone]] = await Promise.all([
    nightReconciliation(night),
    db.all<ExpectedByKind>(deskByKindQuery(night)),
    db.all<{ compsPence: number, discountsPence: number }>(deskForegoneQuery(night)),
  ])
  return {
    night,
    deskByKind,
    deskCompsPence: deskForegone?.compsPence ?? 0,
    deskDiscountsPence: deskForegone?.discountsPence ?? 0,
    deskTakingsPence: reconciliation.deskTakingsPence,
    bar: reconciliation.bar,
    expectedPence: reconciliation.wholeNightExpectedPence,
  }
}

// The live reading for a night: the one row nothing else names in its own supersedes_id, the same
// current-row pattern age_checks and incidents already use.
export function currentReadingQuery(night: string): SQL {
  return sql`
    SELECT z.id AS id, z.night AS night, z.reader_pence AS readerPence, z.expected_pence AS expectedPence,
           z.variance_pence AS variancePence, z.entered_by AS enteredBy, u.name AS enteredByName, z.note AS note,
           z.supersedes_id AS supersedesId, z.written_off AS writtenOff, z.created_at AS createdAt
    FROM z_readings z
    JOIN users u ON u.id = z.entered_by
    WHERE z.night = ${night}
      AND z.id NOT IN (SELECT supersedes_id FROM z_readings WHERE supersedes_id IS NOT NULL)
    ORDER BY z.created_at DESC
    LIMIT 1
  `
}

type ZReadingRow = Omit<ZReading, 'writtenOff'> & { writtenOff: number }

export async function currentReading(night: string): Promise<ZReading | null> {
  const [row] = await db.all<ZReadingRow>(currentReadingQuery(night))
  return row ? { ...row, writtenOff: Boolean(row.writtenOff) } : null
}

// Every reading ever recorded for the night, oldest first, so the resolution chain reads as a
// timeline rather than a single figure.
export function readingHistoryQuery(night: string): SQL {
  return sql`
    SELECT z.id AS id, z.night AS night, z.reader_pence AS readerPence, z.expected_pence AS expectedPence,
           z.variance_pence AS variancePence, z.entered_by AS enteredBy, u.name AS enteredByName, z.note AS note,
           z.supersedes_id AS supersedesId, z.written_off AS writtenOff, z.created_at AS createdAt
    FROM z_readings z
    JOIN users u ON u.id = z.entered_by
    WHERE z.night = ${night}
    ORDER BY z.created_at ASC
  `
}

export async function readingHistory(night: string): Promise<ZReading[]> {
  const rows = await db.all<ZReadingRow>(readingHistoryQuery(night))
  return rows.map(row => ({ ...row, writtenOff: Boolean(row.writtenOff) }))
}

// Nights a till session ran or a performance was on: small, bounded tables unlike the ledger
// itself, so this never scales with how many money transactions the estate has ever posted.
async function operationalNights(): Promise<Set<string>> {
  const [sessions, performances] = await Promise.all([
    db.all<{ night: string }>(sql`SELECT DISTINCT night FROM till_sessions`),
    db.all<{ startsAt: number }>(sql`SELECT DISTINCT starts_at AS startsAt FROM performances`),
  ])
  const nights = new Set(sessions.map(row => row.night))
  for (const { startsAt } of performances) nights.add(performanceNight(startsAt))
  return nights
}

// Every past night that ran and carries no reading at all, never truncated (criterion 5): the
// treasurer dashboard shows every one, the same completeness F-109's unsettled-tabs list keeps.
export async function nightsMissingAReading(): Promise<OutstandingNight[]> {
  const [operational, recorded] = await Promise.all([
    operationalNights(),
    db.all<{ night: string }>(sql`SELECT DISTINCT night FROM z_readings`),
  ])
  const covered = new Set(recorded.map(row => row.night))
  const tonight = currentShowNight()
  return [...operational]
    .filter(night => night <= tonight && !covered.has(night))
    .sort()
    .map(night => ({ night }))
}

// A night whose live reading still disagrees with the ledger and has not been written off: open
// until a correction lands at zero or a write-off names it explicitly (criterion 5).
export function nightsWithOpenVarianceQuery(): SQL {
  return sql`
    SELECT z.night AS night
    FROM z_readings z
    WHERE z.variance_pence <> 0 AND z.written_off = 0
      AND z.id NOT IN (SELECT supersedes_id FROM z_readings WHERE supersedes_id IS NOT NULL)
    ORDER BY z.night
  `
}

export async function nightsWithOpenVariance(): Promise<OutstandingNight[]> {
  return db.all<OutstandingNight>(nightsWithOpenVarianceQuery())
}

export interface PreparedZReading {
  id: string
  expectedPence: number
  variancePence: number
  statement: SQL
}

// Pure, so `tests/` builds a statement with no database (`close.post.ts`'s own split). Guarded
// on the write, not read-then-written (0049): a racing duplicate insert inserts nothing.
export function zReadingStatement(input: RecordZReadingInput, actorId: string, expectedPence: number, id = newId()): PreparedZReading {
  const variancePence = input.readerPence - expectedPence

  if (variancePence !== 0 && !input.note) {
    throw createError({
      statusCode: 400,
      statusMessage: `The reader read ${input.readerPence} pence; the ledger expects ${expectedPence} pence. `
        + 'That difference needs a note before it can be recorded.',
    })
  }
  if (input.writtenOff && (variancePence === 0 || !input.supersedesId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A write-off must name the variance it resolves, and cannot write off a figure that now matches',
    })
  }

  const values = sql`${id}, ${input.night}, ${input.readerPence}, ${expectedPence}, ${variancePence}, ${actorId}, ${input.note ?? null}, ${input.writtenOff}`

  const statement = input.supersedesId
    ? sql`
        INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by, note, written_off, supersedes_id)
        SELECT ${values}, ${input.supersedesId}
        WHERE EXISTS (SELECT 1 FROM z_readings WHERE id = ${input.supersedesId} AND night = ${input.night})
          AND NOT EXISTS (SELECT 1 FROM z_readings WHERE supersedes_id = ${input.supersedesId})
        RETURNING id
      `
    : sql`
        INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by, note, written_off)
        SELECT ${values}
        WHERE NOT EXISTS (SELECT 1 FROM z_readings WHERE night = ${input.night} AND supersedes_id IS NULL)
        RETURNING id
      `

  return { id, expectedPence, variancePence, statement }
}

// Recomputed here, never trusted from an earlier preview read: the ledger may have gained a sale
// between opening the reconciliation screen and pressing confirm (0005, matching F-118's close).
export async function prepareZReading(input: RecordZReadingInput, actorId: string, id = newId()): Promise<PreparedZReading> {
  const expected = await nightExpected(input.night)
  return zReadingStatement(input, actorId, expected.expectedPence, id)
}
