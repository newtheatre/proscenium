import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditedWrite } from './audit'
import { configValue } from './configuration'
import { postEntry } from './ledger'
import { requireNightAuthority } from './night-authority'
import { auditEntry } from '#shared/utils/audit'
import type { Authority } from './authorise'
import type { H3Event } from 'h3'
import type { NightScope } from '#shared/utils/night-authority'

// D-116: refunding a ticket and, once nothing is left owed, cancelling the booking it belonged
// to. Kept apart from server/utils/desk.ts's reads, matching D-114's own collect/desk split.

// Criterion 2, gated by REFUND_PAID_REQUIRES_MANAGER: a standing `money.refund` holder approves
// themselves, or tonight's confirmed duty manager, whose authority derives from the shift (0009).
export async function requireRefundApproval(event: H3Event, resolved: Authority, scope: NightScope): Promise<string> {
  if (!await configValue(event, 'REFUND_PAID_REQUIRES_MANAGER')) return resolved.account.id
  if (resolved.permissions.has('money.refund')) return resolved.account.id
  const night = await requireNightAuthority(event, 'DUTY_MANAGER', scope)
  return night.account.id
}

export interface RefundTicketWriteInput {
  reservationId: string
  ticketId: string
  pricePaid: number
  actorId: string
  performanceId: string
}

export interface RefundTicketResult {
  applied: boolean
  entryId?: string
}

// Race-safe (criterion 4): the ticket's own claim is the arbiter, and `postEntry`'s guard rides
// its `changes()`, so a losing claim posts no ledger entry either (0001).
export async function refundTicket(input: RefundTicketWriteInput, at = new Date()): Promise<RefundTicketResult> {
  const claim = sql`
    UPDATE tickets SET refunded_at = ${Math.floor(at.getTime() / 1000)}
    WHERE id = ${input.ticketId} AND reservation_id = ${input.reservationId} AND refunded_at IS NULL
    RETURNING id
  `

  const posted = postEntry({
    source: 'DESK',
    tender: 'CARD',
    actorId: input.actorId,
    lines: [{
      kind: 'REFUND',
      amountPence: -input.pricePaid,
      qty: 1,
      unitPricePence: input.pricePaid,
      reservationId: input.reservationId,
      ticketId: input.ticketId,
      // Without this a refund is invisible to its own night report (0058, the same gap #791
      // and #795 each found and fixed for a bar sale and a collection).
      performanceId: input.performanceId,
    }],
  }, at, sql`changes() = 1`)

  const entry = auditEntry({
    actorId: input.actorId,
    action: 'ticket.refunded',
    target: `reservation:${input.reservationId}`,
    detail: { ticketId: input.ticketId, amountPence: input.pricePaid },
  })

  const [claimed] = await db.batch([
    db.all<{ id: string }>(claim),
    ...posted.statements,
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
    `),
  ])

  const applied = Array.isArray(claimed) && claimed.length > 0
  return { applied, entryId: applied ? posted.id : undefined }
}

// Criterion 6: refused while any ticket still holds money nobody handed back; the caller (the
// route) sums what `deskReservation`'s own unrefunded-only ticket list already answers.
export async function cancelCollectedReservation(reservationId: string, actorId: string): Promise<boolean> {
  const entry = auditEntry({ actorId, action: 'reservation.cancelled.staff', target: `reservation:${reservationId}` })
  return auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE reservations SET status = 'CANCELLED', cancelled_by = 'STAFF', updated_at = unixepoch()
      WHERE id = ${reservationId} AND status = 'COLLECTED'
      RETURNING id
    `),
    entry,
  )
}
