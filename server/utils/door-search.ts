import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsForReservation } from './capacity'
import { containsPattern } from './list-filters'
import { HOLDING_STATUSES } from '#shared/utils/capacity'
import type { SQL } from 'drizzle-orm'

// The door's one field (issue 1301): tonight's tickets found by the booker's name or the
// reference. Passes keep their own lookup, `doorPassSearchQuery()` in `door.ts` (D-126).

export const DOOR_TICKET_SEARCH_LIMIT = 10

const holding = sql.raw(HOLDING_STATUSES.map(status => `'${status}'`).join(', '))

// When a booking came through the door: the admission's own audit entry, or the row's last change
// for a walk-up sold straight to DOOR, which writes none. Null for anything not yet in.
export function admittedAtColumn(alias: string): SQL {
  const id = sql.raw(`${alias}.id`)
  return sql`CASE WHEN ${sql.raw(alias)}.status = 'DOOR' THEN coalesce(
    (SELECT max(al.created_at) FROM audit_log al WHERE al.action = 'reservation.admitted' AND al.target = 'reservation:' || ${id}),
    ${sql.raw(alias)}.updated_at) END`
}

export interface DoorTicketSearchRow {
  reference: string
  status: string
  holderName: string | null
  partySize: number
  admittedAt: number | null
  holdExpiresAt: number | null
  exchanged: number
}

// This performance only, lapsed and cancelled included so a typed name is not told to check the
// spelling (0233); an erased booker by reference only (0011), a redeemed pass by its card (D-126).
export function doorTicketSearchQuery(term: string, performanceId: string): SQL {
  return sql`
    SELECT rv.reference AS reference, rv.status AS status, u.name AS holderName,
           ${heldSeatsForReservation(sql`rv.id`)} AS partySize, ${admittedAtColumn('rv')} AS admittedAt,
           rv.hold_expires_at AS holdExpiresAt, rv.exchanged_to_reservation_id IS NOT NULL AS exchanged
    FROM reservations rv
    LEFT JOIN users u ON u.id = rv.user_id
    WHERE rv.performance_id = ${performanceId}
      AND rv.status IN (${holding}, 'EXPIRED', 'CANCELLED')
      AND (rv.reference = ${term.toUpperCase()} OR (u.anonymised_at IS NULL AND u.name LIKE ${containsPattern(term)} ESCAPE '\\'))
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
