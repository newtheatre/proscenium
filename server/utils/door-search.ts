import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsForReservation } from './capacity'
import type { SQL } from 'drizzle-orm'

// The door's one field (issue 1301): tonight's tickets found by the booker's name or the
// reference. Passes keep their own lookup, `doorPassSearchQuery()` in `door.ts` (D-126).

export const DOOR_TICKET_SEARCH_LIMIT = 10

// When a booking came through the door: the admission's own audit entry, or the row's last change
// for a walk-up sold straight to DOOR, which writes none. Null for anything not yet in.
export function admittedAtColumn(alias: string): SQL {
  const id = sql.raw(`${alias}.id`)
  return sql`CASE WHEN ${sql.raw(alias)}.status = 'DOOR' THEN coalesce(
    (SELECT max(al.created_at) FROM audit_log al WHERE al.action = 'reservation.admitted' AND al.target = 'reservation:' || ${id}),
    ${sql.raw(alias)}.updated_at) END`
}

export interface DoorTicketSearchRow {
  id: string
  reference: string
  status: string
  holderName: string | null
  partySize: number
  admittedAt: number | null
}

// Live bookings only, this performance only; an erased booker is found by reference, never by
// the name erasure removed (0011). A redeemed pass's seat is the pass card's to admit (D-126).
export function doorTicketSearchQuery(term: string, performanceId: string): SQL {
  const like = `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  return sql`
    SELECT rv.id AS id, rv.reference AS reference, rv.status AS status, u.name AS holderName,
           ${heldSeatsForReservation(sql`rv.id`)} AS partySize, ${admittedAtColumn('rv')} AS admittedAt
    FROM reservations rv
    LEFT JOIN users u ON u.id = rv.user_id
    WHERE rv.performance_id = ${performanceId}
      AND rv.status IN ('PENDING', 'COLLECTED', 'DOOR')
      AND (rv.reference = ${term.toUpperCase()} OR (u.anonymised_at IS NULL AND u.name LIKE ${like} ESCAPE '\\'))
      AND NOT EXISTS (
        SELECT 1 FROM tickets pt JOIN pass_admissions pa ON pa.ticket_id = pt.id WHERE pt.reservation_id = rv.id
      )
    ORDER BY u.name COLLATE NOCASE, rv.reference
    LIMIT ${DOOR_TICKET_SEARCH_LIMIT}
  `
}

export async function doorTicketSearch(term: string, performanceId: string): Promise<DoorTicketSearchRow[]> {
  return db.all<DoorTicketSearchRow>(doorTicketSearchQuery(term, performanceId))
}
