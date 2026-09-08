import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { incidentConstraintRefusal } from '#shared/utils/incidents'
import type { Category, Severity } from '#shared/utils/incidents'
import type { SQL } from 'drizzle-orm'

// The incident log (E-115, E-117). Append-only: nothing here updates or deletes a row, and the
// migration's own triggers refuse it even if something tried.

export interface RecordedIncident {
  id: string
  statement: SQL
}

// No predicate: a fresh entry never contends, since nothing else can have created it.
export function recordIncidentStatement(
  reportedBy: string,
  performanceId: string,
  category: Category,
  severity: Severity,
  body: string,
  happenedAt: number,
  id: string,
  at = new Date(),
): RecordedIncident {
  const statement = sql`
    INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, happened_at, created_at)
    VALUES (${id}, ${performanceId}, ${reportedBy}, ${category}, ${severity}, ${body}, ${happenedAt}, ${Math.floor(at.getTime() / 1000)})
    RETURNING id
  `
  return { id, statement }
}

// A correction, guarded on the write rather than read-then-written: two filed at once settle to
// one winner from this statement's own RETURNING, never a stored actor comparison (0049).
export function supersedeIncidentStatement(
  reportedBy: string,
  entryId: string,
  performanceId: string,
  category: Category,
  severity: Severity,
  body: string,
  happenedAt: number,
  id: string,
  at = new Date(),
): RecordedIncident {
  const statement = sql`
    INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, happened_at, supersedes_id, created_at)
    SELECT ${id}, ${performanceId}, ${reportedBy}, ${category}, ${severity}, ${body}, ${happenedAt}, ${entryId}, ${Math.floor(at.getTime() / 1000)}
    WHERE EXISTS (SELECT 1 FROM incidents WHERE id = ${entryId})
      AND NOT EXISTS (SELECT 1 FROM incidents WHERE supersedes_id = ${entryId})
    RETURNING id
  `
  return { id, statement }
}

// A raw constraint failure is never what a caller reads back; anything unrecognised is rethrown
// (E-106's own shape, matched here for incidents).
export async function withIncidentConstraints<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  }
  catch (error) {
    const refusal = incidentConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
}

export interface IncidentEntry {
  id: string
  performanceId: string
  reportedBy: string
  reportedByName: string
  category: Category
  severity: Severity
  body: string
  happenedAt: number
  supersedesId: string | null
  supersededBy: string | null
  createdAt: number
}

const ENTRY_COLUMNS = sql`
  i.id AS id, i.performance_id AS performanceId, i.reported_by AS reportedBy, u.name AS reportedByName,
  i.category AS category, i.severity AS severity, i.body AS body, i.happened_at AS happenedAt,
  i.supersedes_id AS supersedesId,
  (SELECT s.id FROM incidents s WHERE s.supersedes_id = i.id) AS supersededBy,
  i.created_at AS createdAt
`

// Tonight's log: every entry from a night's own bounds, superseded ones included, because the
// chain has to stay visible (E-115 criterion 3).
export function incidentsOnQuery(from: number, to: number, limit: number, offset: number): SQL {
  return sql`
    SELECT ${ENTRY_COLUMNS}
    FROM incidents i
    JOIN users u ON u.id = i.reported_by
    WHERE i.happened_at >= ${from} AND i.happened_at < ${to}
    ORDER BY i.happened_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countIncidentsOnQuery(from: number, to: number): SQL {
  return sql`SELECT count(*) AS total FROM incidents WHERE happened_at >= ${from} AND happened_at < ${to}`
}

export function incidentByIdQuery(id: string): SQL {
  return sql`
    SELECT ${ENTRY_COLUMNS}
    FROM incidents i
    JOIN users u ON u.id = i.reported_by
    WHERE i.id = ${id}
  `
}

export async function incidentById(id: string): Promise<IncidentEntry | undefined> {
  const [row] = await db.all<IncidentEntry>(incidentByIdQuery(id))
  return row
}
