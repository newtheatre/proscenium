import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { OPEN_ATTEMPT_STATUSES } from '#shared/utils/sumup'
import type { SQL } from 'drizzle-orm'
import type { TillSession } from '#shared/utils/till'

// Reading and guarding tonight's till session (F-102). Opening and closing one is the write
// path's own SQL in its route; what a reader needs is here so nothing restates the shape.

const SESSION_COLUMNS = sql`
  id AS id, venue_id AS venueId, night AS night, opened_by AS openedBy, opened_at AS openedAt,
  closed_by AS closedBy, closed_at AS closedAt, expected_total_pence AS expectedTotalPence,
  actual_z_pence AS actualZPence, variance_pence AS variancePence, variance_note AS varianceNote
`

// The open session only: closing one and opening another later that night is a second row, so
// venue and night alone no longer name exactly one (F-102 criterion 1).
export function openSessionForQuery(venueId: string, night: string): SQL {
  return sql`
    SELECT ${SESSION_COLUMNS} FROM till_sessions
    WHERE venue_id = ${venueId} AND night = ${night} AND closed_at IS NULL
  `
}

export interface SessionClose {
  id: string
  venueId: string
  night: string
  closedBy: string
  expectedPence: number
  actualZPence: number
  variancePence: number
  varianceNote: string | null
}

// Both predicates ride the write (0001, 0003): a second close changes nothing, and a hand-off at
// any bar tonight, started since the count was read, refuses it: one reader (F-124, issue 1308).
export function closeSessionStatement(close: SessionClose): SQL {
  return sql`
    UPDATE till_sessions SET closed_by = ${close.closedBy}, closed_at = unixepoch(),
      expected_total_pence = ${close.expectedPence}, actual_z_pence = ${close.actualZPence},
      variance_pence = ${close.variancePence}, variance_note = ${close.varianceNote}
    WHERE id = ${close.id} AND closed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM sumup_attempts
        WHERE night = ${close.night}
          AND status IN (${sql.join(OPEN_ATTEMPT_STATUSES.map(status => sql`${status}`), sql`, `)})
      )
    RETURNING id
  `
}

export function sessionByIdQuery(id: string): SQL {
  return sql`SELECT ${SESSION_COLUMNS} FROM till_sessions WHERE id = ${id}`
}

// Every unclosed session from a night that has already ended, for the duty manager's close-night
// checklist (F-102 criterion 5). The checklist screen is E-114's and does not exist yet.
export function staleUnclosedSessionsQuery(tonight: string): SQL {
  return sql`SELECT ${SESSION_COLUMNS} FROM till_sessions WHERE closed_at IS NULL AND night <> ${tonight} ORDER BY night`
}

export async function openSessionFor(venueId: string, night: string): Promise<TillSession | null> {
  const [row] = await db.all<TillSession>(openSessionForQuery(venueId, night))
  return row ?? null
}

export async function sessionById(id: string): Promise<TillSession | null> {
  const [row] = await db.all<TillSession>(sessionByIdQuery(id))
  return row ?? null
}

export async function staleUnclosedSessions(tonight: string): Promise<TillSession[]> {
  return db.all<TillSession>(staleUnclosedSessionsQuery(tonight))
}

export function isOpen(session: TillSession | null): session is TillSession {
  return session !== null && session.closedAt === null
}

// What F-103, F-104, F-105, F-108 and F-110 call before writing a line: none of those routes
// exist yet, so nothing outside this file's own tests calls it (F-102 criterion 3).
export function requireOpenSession(session: TillSession | null): TillSession {
  if (!isOpen(session)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No till session is open here: open one before ringing anything up',
    })
  }
  return session
}
