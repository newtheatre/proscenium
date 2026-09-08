import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { ageCheckConstraintRefusal } from '#shared/utils/age-checks'
import type { AgeCheckInput, AgeCheckOutcome, IdType, RefusalReason } from '#shared/utils/age-checks'
import type { SQL } from 'drizzle-orm'

// The Challenge 25 register (E-118). Append-only: nothing here updates or deletes a row, and the
// migration's own triggers refuse it even if something tried.

export interface RecordedAgeCheck {
  id: string
  statement: SQL
}

// A statement, not a completed write, so a caller with a till sale batches both together or
// neither (E-118 criterion 4, `postEntry`'s own shape). No predicate: a fresh entry never contends.
export function recordAgeCheck(checkedBy: string, input: AgeCheckInput, id: string, at = new Date()): RecordedAgeCheck {
  const statement = sql`
    INSERT INTO age_checks (id, performance_id, checked_by, outcome, id_type, reason, description, product, notes, created_at)
    VALUES (${id}, ${input.performanceId}, ${checkedBy}, ${input.outcome}, ${input.idType}, ${input.reason},
            ${input.description}, ${input.product}, ${input.notes}, ${Math.floor(at.getTime() / 1000)})
    RETURNING id
  `
  return { id, statement }
}

// A correction, guarded on the write rather than read-then-written: two filed at once settle to
// one winner from this statement's own RETURNING, never a stored actor comparison (0049).
export function supersedeAgeCheck(checkedBy: string, entryId: string, input: AgeCheckInput, id: string, at = new Date()): RecordedAgeCheck {
  const statement = sql`
    INSERT INTO age_checks (id, performance_id, checked_by, outcome, id_type, reason, description, product, notes, supersedes_id, created_at)
    SELECT ${id}, ${input.performanceId}, ${checkedBy}, ${input.outcome}, ${input.idType}, ${input.reason},
           ${input.description}, ${input.product}, ${input.notes}, ${entryId}, ${Math.floor(at.getTime() / 1000)}
    WHERE EXISTS (SELECT 1 FROM age_checks WHERE id = ${entryId})
      AND NOT EXISTS (SELECT 1 FROM age_checks WHERE supersedes_id = ${entryId})
    RETURNING id
  `
  return { id, statement }
}

// A raw constraint failure is never what a caller reads back; anything unrecognised is rethrown
// (E-106's own shape, matched here for age checks).
export async function withAgeCheckConstraints<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  }
  catch (error) {
    const refusal = ageCheckConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
}

export interface AgeCheckEntry {
  id: string
  performanceId: string | null
  checkedBy: string
  checkedByName: string
  outcome: AgeCheckOutcome
  idType: IdType | null
  reason: RefusalReason | null
  description: string
  product: string | null
  notes: string | null
  supersedesId: string | null
  supersededBy: string | null
  createdAt: number
}

const ENTRY_COLUMNS = sql`
  a.id AS id, a.performance_id AS performanceId, a.checked_by AS checkedBy, u.name AS checkedByName,
  a.outcome AS outcome, a.id_type AS idType, a.reason AS reason, a.description AS description,
  a.product AS product, a.notes AS notes, a.supersedes_id AS supersedesId,
  (SELECT s.id FROM age_checks s WHERE s.supersedes_id = a.id) AS supersededBy,
  a.created_at AS createdAt
`

// Tonight's register: every entry from a night's own bounds, superseded ones included, because
// the chain has to stay visible (E-118 criterion 3, E-115's own shape).
export function ageChecksOnQuery(from: number, to: number, limit: number, offset: number): SQL {
  return sql`
    SELECT ${ENTRY_COLUMNS}
    FROM age_checks a
    JOIN users u ON u.id = a.checked_by
    WHERE a.created_at >= ${from} AND a.created_at < ${to}
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countAgeChecksOnQuery(from: number, to: number): SQL {
  return sql`SELECT count(*) AS total FROM age_checks WHERE created_at >= ${from} AND created_at < ${to}`
}

export function ageCheckByIdQuery(id: string): SQL {
  return sql`
    SELECT ${ENTRY_COLUMNS}
    FROM age_checks a
    JOIN users u ON u.id = a.checked_by
    WHERE a.id = ${id}
  `
}

export async function ageCheckById(id: string): Promise<AgeCheckEntry | undefined> {
  const [row] = await db.all<AgeCheckEntry>(ageCheckByIdQuery(id))
  return row
}
