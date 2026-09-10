import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditedWrite } from './audit'
import { writeReservation } from './reservations'
import { auditEntry } from '#shared/utils/audit'
import type { ReservationLineToWrite, WriteReservationResult } from './reservations'
import type { SQL } from 'drizzle-orm'

// D-111: moving an unpaid reservation to another performance of the same show. Kept apart from
// server/utils/reservations.ts, which `tests/` imports directly under Bun (0055).

export interface ExchangeReservationInput {
  reservationId: string
  userId: string | null
  targetPerformanceId: string
  lines: ReservationLineToWrite[]
  capacity: number | null
  holdExpiresAt: number
}

export interface ExchangeReservationResult {
  applied: boolean
  reservation?: WriteReservationResult
}

// The move from PENDING to cancelled-with-a-pointer, 0049's shape: whichever of two concurrent
// exchanges (or an exchange racing a desk collection or a release) runs this first wins it.
export function claimForExchangeStatement(reservationId: string, newReservationId: string): SQL {
  return sql`
    UPDATE reservations
    SET status = 'CANCELLED', cancelled_by = 'CUSTOMER', exchanged_to_reservation_id = ${newReservationId}, hold_expires_at = NULL, updated_at = unixepoch()
    WHERE id = ${reservationId} AND status = 'PENDING'
    RETURNING id
  `
}

// Criterion 1, honestly within what D1 offers (one `db.batch` per write, 0003): the new hold is
// secured first, capacity-checked at that moment; the old one is claimed only once that lands.
export async function exchangeReservation(input: ExchangeReservationInput): Promise<ExchangeReservationResult> {
  const written = await writeReservation({
    performanceId: input.targetPerformanceId,
    userId: input.userId,
    source: 'WEB',
    windowBypassed: false,
    lines: input.lines,
    capacity: input.capacity,
    holdExpiresAt: input.holdExpiresAt,
  })

  // `writeReservation` already cancels its own row when a capacity race seats nothing: the old
  // reservation is never touched, so the seats it holds are not released (criterion 1).
  if (written.tickets.length < written.requested) {
    return { applied: false }
  }

  const entry = auditEntry({
    actorId: input.userId,
    action: 'reservation.exchanged',
    target: `reservation:${input.reservationId}`,
    detail: { toReservationId: written.id },
  })

  const claimed = await auditedWrite(
    db.all<{ id: string }>(claimForExchangeStatement(input.reservationId, written.id)),
    entry,
  )

  if (!claimed) {
    // Lost a race between securing the new hold and claiming the old one (a desk collection, a
    // release, a second exchange attempt): the new hold is real and unreachable, so it is undone.
    await db.run(sql`UPDATE reservations SET status = 'CANCELLED', updated_at = unixepoch() WHERE id = ${written.id} AND status = 'PENDING'`)
    return { applied: false }
  }

  return { applied: true, reservation: written }
}
