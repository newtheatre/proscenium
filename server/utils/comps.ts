import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { auditedWrite } from '#server/utils/audit'
import { compRequestExpired } from '#shared/utils/comps'
import { auditEntry } from '#shared/utils/audit'
import type { BasketLineInput } from '#shared/utils/sale'
import type { CompRequest, CompRequestStatus } from '#shared/utils/comps'

// The `comp_requests` table: a plain row whose `status` transitions once, claimed by a conditional
// write (0003, 0006). Pricing and spending it are `server/utils/sale.ts`'s; this never posts.

interface RawRow {
  id: string
  venueId: string
  night: string
  requestedBy: string
  requestedByName: string
  reason: string
  lines: string
  status: CompRequestStatus
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: number | null
  declineReason: string | null
  entryId: string | null
  createdAt: number
}

const ROW_COLUMNS = sql`
  r.id AS id, r.venue_id AS venueId, r.night AS night, r.requested_by AS requestedBy, u.name AS requestedByName,
  r.reason AS reason, r.lines AS lines, r.status AS status, r.decided_by AS decidedBy, d.name AS decidedByName,
  r.decided_at AS decidedAt, r.decline_reason AS declineReason, r.entry_id AS entryId, r.created_at AS createdAt
`

function hydrate(row: RawRow, expiryMinutes: number, now: Date): CompRequest {
  const { lines: _lines, ...rest } = row
  return { ...rest, expired: row.status === 'PENDING' && compRequestExpired(row.createdAt, expiryMinutes, now) }
}

// The basket a request names, for whoever has to re-resolve it: the approver's queue prices it
// live to show what would be given away, and a comp sale re-resolves the same lines to spend it.
export async function compRequestLines(id: string): Promise<BasketLineInput[] | undefined> {
  const [row] = await db.all<{ lines: string }>(sql`SELECT lines FROM comp_requests WHERE id = ${id}`)
  return row ? (JSON.parse(row.lines) as BasketLineInput[]) : undefined
}

export async function compRequestById(id: string, expiryMinutes: number, now = new Date()): Promise<CompRequest | undefined> {
  const [row] = await db.all<RawRow>(sql`
    SELECT ${ROW_COLUMNS} FROM comp_requests r
    JOIN users u ON u.id = r.requested_by
    LEFT JOIN users d ON d.id = r.decided_by
    WHERE r.id = ${id}
  `)
  return row ? hydrate(row, expiryMinutes, now) : undefined
}

// The approver's queue: only ever a handful open at once, so a plain per-request read (the
// caller prices each one) beats folding pricing into this query (0003's reasoning applied small).
export async function pendingCompRequests(venueId: string, night: string, expiryMinutes: number, now = new Date()): Promise<CompRequest[]> {
  const rows = await db.all<RawRow>(sql`
    SELECT ${ROW_COLUMNS} FROM comp_requests r
    JOIN users u ON u.id = r.requested_by
    LEFT JOIN users d ON d.id = r.decided_by
    WHERE r.venue_id = ${venueId} AND r.night = ${night} AND r.status = 'PENDING'
    ORDER BY r.created_at
  `)
  return rows.map(row => hydrate(row, expiryMinutes, now))
}

export async function createCompRequest(
  requestedBy: string,
  venueId: string,
  night: string,
  reason: string,
  lines: BasketLineInput[],
): Promise<string> {
  const id = newId()
  await db.batch([
    db.run(sql`
      INSERT INTO comp_requests (id, venue_id, night, requested_by, reason, lines)
      VALUES (${id}, ${venueId}, ${night}, ${requestedBy}, ${reason}, ${JSON.stringify(lines)})
    `),
    // No `reason` in detail: that is free text and belongs on the record itself, which the
    // target id already points at (0011).
    db.insert(schema.auditLog).values(auditEntry({
      actorId: requestedBy,
      action: 'bar.comp-request.created',
      target: `comp-request:${id}`,
      detail: { venueId, night },
    })),
  ])
  return id
}

export type CompDecisionRefusal = 'not-found' | 'not-pending' | 'expired' | 'self'

// Claimed like a till session closes (0001, 0003), the predicate carrying every rule a read-first
// would need. Self-decision is refused on a decline too, not just criterion 1's approval.
export async function decideCompRequest(
  id: string,
  deciderId: string,
  outcome: Extract<CompRequestStatus, 'APPROVED' | 'DECLINED'>,
  declineReason: string | null,
  expiryMinutes: number,
  now = new Date(),
): Promise<CompDecisionRefusal | null> {
  const cutoff = Math.floor(now.getTime() / 1000) - expiryMinutes * 60
  const decided = await auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE comp_requests
      SET status = ${outcome}, decided_by = ${deciderId}, decided_at = unixepoch(), decline_reason = ${declineReason}
      WHERE id = ${id} AND status = 'PENDING' AND requested_by <> ${deciderId} AND created_at > ${cutoff}
      RETURNING id
    `),
    // No `declineReason` in detail, for the same reason the request's own `reason` stays out:
    // the record itself carries it, and the target id is how a reader finds it (0011).
    auditEntry({
      actorId: deciderId,
      action: outcome === 'APPROVED' ? 'bar.comp-request.approved' : 'bar.comp-request.declined',
      target: `comp-request:${id}`,
      detail: {},
    }),
  )
  if (decided) return null

  const current = await compRequestById(id, expiryMinutes, now)
  if (!current) return 'not-found'
  if (current.requestedBy === deciderId) return 'self'
  if (current.status !== 'PENDING') return 'not-pending'
  return 'expired'
}

// Claimed before anything is posted, so two tills ringing up the same comp cannot both succeed
// (criterion 2); `server/utils/sale.ts` releases this claim if its ledger write then fails.
export async function claimCompRequestForSale(id: string, entryId: string, expiryMinutes: number, now = new Date()): Promise<boolean> {
  const cutoff = Math.floor(now.getTime() / 1000) - expiryMinutes * 60
  const rows = await db.all<{ id: string }>(sql`
    UPDATE comp_requests SET entry_id = ${entryId}
    WHERE id = ${id} AND status = 'APPROVED' AND entry_id IS NULL AND created_at > ${cutoff}
    RETURNING id
  `)
  return rows.length > 0
}

export async function releaseCompRequestClaim(id: string, entryId: string): Promise<void> {
  await db.run(sql`UPDATE comp_requests SET entry_id = NULL WHERE id = ${id} AND entry_id = ${entryId}`)
}

// The refusal a caller throws when a claim never applied: named so both the approval route and the
// comp-sale route can quote why without duplicating the reasoning.
export function compDecisionRefusalError(refusal: CompDecisionRefusal) {
  const messages: Record<CompDecisionRefusal, string> = {
    'not-found': 'No such comp request',
    'not-pending': 'That request has already been decided',
    'expired': 'That request has lapsed; ask again',
    'self': 'You cannot decide your own request',
  }
  return createError({ statusCode: 409, statusMessage: messages[refusal] })
}
