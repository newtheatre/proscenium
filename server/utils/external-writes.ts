import { sql } from 'drizzle-orm'
import { auditIfChanged, auditWhere, entryLanded } from './audit'
import { claimRoomSlotStatement } from './bookings'
import { LIVE_EXTERNAL } from '#shared/utils/external-requests'
import type { ClaimInput } from './bookings'
import type { AuditRow } from '#shared/utils/audit'
import type { ExternalStatus } from '#shared/utils/external-requests'
import type { SQL } from 'drizzle-orm'

// The guarded writes on a request for a room we do not manage, each batch built apart from its run
// so a test can run it on a real schema (0049). Named imports: `tests/` typechecks this under Bun.

// Guarded on the status it read (0006), and on `also` for a move that must land with another write.
export function moveRequestSql(id: string, from: readonly ExternalStatus[], set: Record<string, unknown>, also?: SQL): SQL {
  const assignments = sql.join(
    Object.entries(set).map(([column, value]) => sql`${sql.identifier(column)} = ${value}`),
    sql`, `,
  )
  const states = from.map(status => sql`${status}`)

  return sql`
    UPDATE external_requests SET ${assignments}
    WHERE id = ${id} AND status IN (${sql.join(states, sql`, `)})
      ${also ? sql`AND ${also}` : sql``}
    RETURNING id
  `
}

export interface Assignment {
  id: string
  requestId: string
  spaceId: string
  outcome: 'ACCEPTED' | 'REFUSED'
  reason: string | null
  recordedBy: string
  recordedAt: number
}

export interface SpaceNoteWrite {
  id: string
  spaceId: string
  purpose: string
  verdict: string
  reason: string
  writtenBy: string
  now: number
}

// Every room offered, kept, and written only with the audited move it belongs to (C-120).
function assignmentStatement(row: Assignment, onlyWith: AuditRow): SQL {
  return sql`
    INSERT INTO external_assignments (id, request_id, space_id, outcome, reason, recorded_by, recorded_at)
    SELECT ${row.id}, ${row.requestId}, ${row.spaceId}, ${row.outcome}, ${row.reason}, ${row.recordedBy}, ${row.recordedAt}
    WHERE ${entryLanded(onlyWith)}
  `
}

// Upserted on the pair: two verdicts about one room and one purpose would leave nobody knowing
// which applied. The WHERE is also what SQLite needs to parse an upsert on a SELECT.
function spaceNoteStatement(note: SpaceNoteWrite, onlyWith: AuditRow): SQL {
  return sql`
    INSERT INTO external_space_notes (id, space_id, purpose, verdict, reason, written_by)
    SELECT ${note.id}, ${note.spaceId}, ${note.purpose}, ${note.verdict}, ${note.reason}, ${note.writtenBy}
    WHERE ${entryLanded(onlyWith)}
    ON CONFLICT (space_id, purpose) DO UPDATE SET
      verdict = excluded.verdict, reason = excluded.reason, written_by = excluded.written_by, updated_at = ${note.now}
  `
}

// From CONFIRMED too, and guarded on both: being moved room to room after an answer is ordinary,
// and the room we were given has to be correctable (0006, C-120). The move's rows come first.
export function assignStatements(set: Record<string, unknown>, row: Assignment, entry: AuditRow): SQL[] {
  return [
    moveRequestSql(row.requestId, ['AWAITING_EXTERNAL', 'CONFIRMED'], set),
    auditIfChanged(entry),
    assignmentStatement(row, entry),
  ]
}

// A room refused after confirming is still a room we no longer have, so it goes back to waiting,
// and the note written in the same action lands only with the refusal (C-119).
export function refuseAssignmentStatements(row: Assignment, entry: AuditRow, note: { note: SpaceNoteWrite, entry: AuditRow } | null): SQL[] {
  const statements = [
    moveRequestSql(row.requestId, ['AWAITING_EXTERNAL', 'CONFIRMED'], { status: 'AWAITING_EXTERNAL', assigned_space_id: null, updated_at: row.recordedAt }),
    auditIfChanged(entry),
    assignmentStatement(row, entry),
  ]
  if (note) statements.push(spaceNoteStatement(note.note, entry), auditWhere(note.entry, entryLanded(entry)))
  return statements
}

// Two guarded attempts, and at most one can match: whether the form was already in decides who is
// told. The first attempt's rows come first in the batch's results and the second's third.
export function withdrawStatements(id: string, now: number, entry: () => AuditRow): SQL[] {
  const cancelling = { status: 'CANCELLED', updated_at: now }
  return [
    moveRequestSql(id, ['AWAITING_EXTERNAL', 'CONFIRMED'], cancelling),
    auditIfChanged(entry()),
    moveRequestSql(id, ['REQUESTED'], cancelling),
    auditIfChanged(entry()),
  ]
}

export interface Relist { requestId: string, claimId: string, claim: ClaimInput, now: number }

// The claim waits on the request still being live and the move on the claim, so the two land
// together or not at all, and no booking is claimed only to be cancelled (0003). Claim rows first.
export function relistStatements(relist: Relist, entry: AuditRow): SQL[] {
  const live = LIVE_EXTERNAL.map(status => sql`${status}`)
  return [
    claimRoomSlotStatement(relist.claimId, relist.claim,
      sql`EXISTS (SELECT 1 FROM external_requests WHERE id = ${relist.requestId} AND status IN (${sql.join(live, sql`, `)}))`),
    moveRequestSql(relist.requestId, LIVE_EXTERNAL, { status: 'CANCELLED', converted_to_booking_id: relist.claimId, updated_at: relist.now },
      sql`EXISTS (SELECT 1 FROM room_bookings WHERE id = ${relist.claimId})`),
    auditIfChanged(entry),
    sql`UPDATE room_bookings SET converted_from_request_id = ${relist.requestId} WHERE id = ${relist.claimId}`,
  ]
}

export interface Unlisted {
  id: string
  userId: string
  title: string
  purpose: string
  attendees: number | null
  startsAt: number
  endsAt: number
  notes: string | null
  seriesId: string | null
  occurrence: number | null
}

// The reason does not cross: it answers why a member is asking for something outside our policy,
// which is not a question the other side asks (C-123 criterion 6).
export function unlistStatements(booking: Unlisted, requestId: string, now: number, entry: AuditRow): SQL[] {
  return [
    sql`
      INSERT INTO external_requests (id, user_id, title, purpose, attendees, starts_at, ends_at, notes, status,
                                     converted_from_booking_id, series_id, occurrence)
      VALUES (${requestId}, ${booking.userId}, ${booking.title}, ${booking.purpose},
              ${booking.attendees}, ${booking.startsAt}, ${booking.endsAt}, ${booking.notes}, 'REQUESTED', ${booking.id},
              ${booking.seriesId}, ${booking.occurrence})
    `,
    sql`
      UPDATE room_bookings SET status = 'CANCELLED', converted_to_request_id = ${requestId}, updated_at = ${now}
      WHERE id = ${booking.id} AND status = 'PENDING_APPROVAL'
    `,
    auditIfChanged(entry),
    // Reached only when somebody decided the request between the read and the write: the duplicate
    // primary key fails the batch rather than leaving a request nothing points at (0035).
    sql`
      INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at)
      SELECT ${requestId}, ${booking.userId}, ${booking.title}, ${booking.purpose}, ${booking.startsAt}, ${booking.endsAt}
      WHERE NOT EXISTS (
        SELECT 1 FROM room_bookings WHERE id = ${booking.id} AND converted_to_request_id = ${requestId}
      )
    `,
  ]
}
