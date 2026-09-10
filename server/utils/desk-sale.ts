import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { postEntry, runLedgerBatch } from './ledger'
import { writeReservation } from './reservations'
import { auditEntry } from '#shared/utils/audit'
import type { ReservationLineToWrite, WrittenTicket } from './reservations'
import type { BatchItem } from 'drizzle-orm/batch'

// D-115: a walk-up sale is D-104's own write path (`writeReservation`), then its own payment
// boundary, one request and two batches (0001, 0003), the same split desk-collection.ts keeps.

export interface WalkUpSaleInput {
  performanceId: string
  userId: string
  lines: ReservationLineToWrite[]
  capacity: number | null
  windowBypassed: boolean
  holdExpiresAt: number | null
  expectedTotalPence: number
  actorId: string
}

export interface WalkUpSaleResult {
  reservationId: string
  reference: string
  entryId: string
  totalPence: number
}

export interface WalkUpSaleCapacityFailure {
  applied: false
  requested: number
  written: number
}

export type WalkUpSaleOutcome
  = | { applied: true, result: WalkUpSaleResult }
    | WalkUpSaleCapacityFailure

// Criterion 1's "one desk flow": the reservation is never left PENDING for a second request to
// find. A capacity loss between resolving prices and this write refuses the whole sale (D-105).
export async function sellWalkUp(input: WalkUpSaleInput): Promise<WalkUpSaleOutcome> {
  const written = await writeReservation({
    performanceId: input.performanceId,
    userId: input.userId,
    // The reservation's own channel is DOOR (criterion 1); the ledger entry's source stays DESK
    // below, the SumUp reader the money actually moved through (D-114's own source).
    source: 'DOOR',
    windowBypassed: input.windowBypassed,
    lines: input.lines,
    capacity: input.capacity,
    holdExpiresAt: input.holdExpiresAt,
  })

  if (written.tickets.length < written.requested) {
    return { applied: false, requested: written.requested, written: written.tickets.length }
  }

  return { applied: true, result: await collectWalkUp(written.id, written.reference, written.tickets, input) }
}

// The payment boundary, its own money path distinct from D-114's `TICKET_COLLECTION`
// (`docs/architecture.md`'s money-paths table, `WALK_UP` in `shared/utils/ledger.ts`).
async function collectWalkUp(
  reservationId: string,
  reference: string,
  tickets: WrittenTicket[],
  input: WalkUpSaleInput,
): Promise<WalkUpSaleResult> {
  const posted = postEntry({
    source: 'DESK',
    tender: 'CARD',
    actorId: input.actorId,
    lines: tickets.map(ticket => ({
      kind: 'WALK_UP',
      amountPence: ticket.pricePaid,
      qty: 1,
      unitPricePence: ticket.pricePaid,
      reservationId,
      ticketId: ticket.id,
      performanceId: input.performanceId,
    })),
  })

  const entry = auditEntry({
    actorId: input.actorId,
    action: 'reservation.collected',
    target: `reservation:${reservationId}`,
    detail: { tender: 'CARD', totalPence: input.expectedTotalPence },
  })

  const statements: BatchItem<'sqlite'>[] = [
    db.run(sql`
      UPDATE reservations SET status = 'COLLECTED', hold_expires_at = NULL, updated_at = unixepoch()
      WHERE id = ${reservationId} AND status = 'PENDING'
    `),
    ...posted.statements,
    db.insert(schema.auditLog).values(entry),
  ]

  await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return { reservationId, reference, entryId: posted.id, totalPence: input.expectedTotalPence }
}
