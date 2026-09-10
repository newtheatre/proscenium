import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { auditEntry } from '#shared/utils/audit'
import { ticketCompRequestExpired } from '#shared/utils/ticket-comps'
import type { TicketCompRequest, TicketCompRequestStatus } from '#shared/utils/ticket-comps'

// The `ticket_comp_requests` table: a plain row whose `status` transitions once, claimed by a
// conditional write (0003, 0006), the same shape server/utils/comps.ts's bar comps already take.

interface RawRow {
  id: string
  reservationId: string
  performanceId: string
  requestedBy: string
  requestedByName: string
  reason: string
  status: TicketCompRequestStatus
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: number | null
  declineReason: string | null
  entryId: string | null
  createdAt: number
}

const ROW_COLUMNS = sql`
  r.id AS id, r.reservation_id AS reservationId, r.performance_id AS performanceId,
  r.requested_by AS requestedBy, u.name AS requestedByName, r.reason AS reason, r.status AS status,
  r.decided_by AS decidedBy, d.name AS decidedByName, r.decided_at AS decidedAt,
  r.decline_reason AS declineReason, r.entry_id AS entryId, r.created_at AS createdAt
`

function hydrate(row: RawRow, expiryMinutes: number, now: Date): TicketCompRequest {
  return { ...row, expired: row.status === 'PENDING' && ticketCompRequestExpired(row.createdAt, expiryMinutes, now) }
}

export async function ticketCompRequestById(id: string, expiryMinutes: number, now = new Date()): Promise<TicketCompRequest | undefined> {
  const [row] = await db.all<RawRow>(sql`
    SELECT ${ROW_COLUMNS} FROM ticket_comp_requests r
    JOIN users u ON u.id = r.requested_by
    LEFT JOIN users d ON d.id = r.decided_by
    WHERE r.id = ${id}
  `)
  return row ? hydrate(row, expiryMinutes, now) : undefined
}

// The one still-open request against a reservation, if any: the desk asks this rather than an
// id it would otherwise have to carry from the request screen to the collection screen.
export async function pendingTicketCompRequestForReservation(reservationId: string, expiryMinutes: number, now = new Date()): Promise<TicketCompRequest | undefined> {
  const [row] = await db.all<RawRow>(sql`
    SELECT ${ROW_COLUMNS} FROM ticket_comp_requests r
    JOIN users u ON u.id = r.requested_by
    LEFT JOIN users d ON d.id = r.decided_by
    WHERE r.reservation_id = ${reservationId} AND r.status IN ('PENDING', 'APPROVED') AND r.entry_id IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1
  `)
  return row ? hydrate(row, expiryMinutes, now) : undefined
}

// The approver's queue: only ever a handful open at once (the same reasoning bar comps read
// small, 0003 applied), so a plain per-performance read beats a paged one.
export async function pendingTicketCompRequests(performanceId: string, expiryMinutes: number, now = new Date()): Promise<TicketCompRequest[]> {
  const rows = await db.all<RawRow>(sql`
    SELECT ${ROW_COLUMNS} FROM ticket_comp_requests r
    JOIN users u ON u.id = r.requested_by
    LEFT JOIN users d ON d.id = r.decided_by
    WHERE r.performance_id = ${performanceId} AND r.status = 'PENDING'
    ORDER BY r.created_at
  `)
  return rows.map(row => hydrate(row, expiryMinutes, now))
}

export async function createTicketCompRequest(requestedBy: string, reservationId: string, performanceId: string, reason: string): Promise<string> {
  const id = newId()
  await db.batch([
    db.run(sql`
      INSERT INTO ticket_comp_requests (id, reservation_id, performance_id, requested_by, reason)
      VALUES (${id}, ${reservationId}, ${performanceId}, ${requestedBy}, ${reason})
    `),
    // No `reason` in detail: that is free text and belongs on the record itself, which the
    // target id already points at (0011).
    db.insert(schema.auditLog).values(auditEntry({
      actorId: requestedBy,
      action: 'ticketing.comp-request.created',
      target: `ticket-comp-request:${id}`,
      detail: { reservationId, performanceId },
    })),
  ])
  return id
}

export type TicketCompDecisionRefusal = 'not-found' | 'not-pending' | 'expired' | 'self'

// Claimed like a bar comp is decided (0001, 0003), the predicate carrying every rule a read-first
// would need. Self-decision is refused on a decline too, not just criterion 1's approval.
export async function decideTicketCompRequest(
  id: string,
  deciderId: string,
  outcome: Extract<TicketCompRequestStatus, 'APPROVED' | 'DECLINED'>,
  declineReason: string | null,
  expiryMinutes: number,
  now = new Date(),
): Promise<TicketCompDecisionRefusal | null> {
  const cutoff = Math.floor(now.getTime() / 1000) - expiryMinutes * 60
  const decided = await auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE ticket_comp_requests
      SET status = ${outcome}, decided_by = ${deciderId}, decided_at = unixepoch(), decline_reason = ${declineReason}
      WHERE id = ${id} AND status = 'PENDING' AND requested_by <> ${deciderId} AND created_at > ${cutoff}
      RETURNING id
    `),
    // No `declineReason` in detail, for the same reason the request's own `reason` stays out:
    // the record itself carries it (0011).
    auditEntry({
      actorId: deciderId,
      action: outcome === 'APPROVED' ? 'ticketing.comp-request.approved' : 'ticketing.comp-request.declined',
      target: `ticket-comp-request:${id}`,
      detail: {},
    }),
  )
  if (decided) return null

  const current = await ticketCompRequestById(id, expiryMinutes, now)
  if (!current) return 'not-found'
  if (current.requestedBy === deciderId) return 'self'
  if (current.status !== 'PENDING') return 'not-pending'
  return 'expired'
}

// Claimed before anything is posted, so two collections against the same approval cannot both
// succeed (criterion 2); `server/utils/desk-collection.ts` releases this claim if the batch fails.
export async function claimTicketCompRequestForCollection(id: string, entryId: string, expiryMinutes: number, now = new Date()): Promise<boolean> {
  const cutoff = Math.floor(now.getTime() / 1000) - expiryMinutes * 60
  const rows = await db.all<{ id: string }>(sql`
    UPDATE ticket_comp_requests SET entry_id = ${entryId}
    WHERE id = ${id} AND status = 'APPROVED' AND entry_id IS NULL AND created_at > ${cutoff}
    RETURNING id
  `)
  return rows.length > 0
}

export async function releaseTicketCompRequestClaim(id: string, entryId: string): Promise<void> {
  await db.run(sql`UPDATE ticket_comp_requests SET entry_id = NULL WHERE id = ${id} AND entry_id = ${entryId}`)
}

// The refusal a caller throws when a claim never applied, named so the approval and the
// collection route can both quote why without duplicating the reasoning.
export function ticketCompDecisionRefusalError(refusal: TicketCompDecisionRefusal) {
  const messages: Record<TicketCompDecisionRefusal, string> = {
    'not-found': 'No such comp request',
    'not-pending': 'That request has already been decided',
    'expired': 'That request has lapsed; ask again',
    'self': 'You cannot decide your own request',
  }
  return createError({ statusCode: 409, statusMessage: messages[refusal] })
}
