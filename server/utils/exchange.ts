import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditedWrite } from './audit'
import { writeReservation } from './reservations'
import { auditEntry } from '#shared/utils/audit'
import type { ReservationLineToWrite, WriteReservationResult } from './reservations'

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

// Criterion 1's atomicity, honestly within what D1 actually offers (one `db.batch` per write,
// 0003): the new reservation is secured first, through D-104's own write path, capacity-checked
// at this exact moment; the old one is claimed only once that has fully succeeded, so a booker
// who loses the destination never loses the seats they already held. The same two-phase shape
// D-113's claim uses for the identical reason (mark the winner, then do the slower work).
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
    db.all<{ id: string }>(sql`
      UPDATE reservations
      SET status = 'CANCELLED', cancelled_by = 'CUSTOMER', exchanged_to_reservation_id = ${written.id}, hold_expires_at = NULL, updated_at = unixepoch()
      WHERE id = ${input.reservationId} AND status = 'PENDING'
      RETURNING id
    `),
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
