import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsForReservation } from './capacity'
import { auditedWrite } from './audit'
import { auditEntry } from '#shared/utils/audit'
import type { SQL } from 'drizzle-orm'

// The physical check-in a redeemed pass still needs (D-126): `reservations.status = 'DOOR'` is
// what E-112's own `admitted` figure already reads (server/utils/tonight.ts).

// PENDING or COLLECTED both admit; DOOR itself is refused by the same guard, so two racing scans
// of one reservation admit exactly once (tests/integration/races-door-admission.test.ts).
export function admitAtDoorStatement(reservationId: string): SQL {
  return sql`
    UPDATE reservations SET status = 'DOOR', updated_at = unixepoch()
    WHERE id = ${reservationId} AND status IN ('PENDING', 'COLLECTED')
    RETURNING id
  `
}

export async function admitAtDoor(reservationId: string, actorId: string): Promise<boolean> {
  const entry = auditEntry({ actorId, action: 'reservation.admitted', target: `reservation:${reservationId}` })
  return auditedWrite(db.all<{ id: string }>(admitAtDoorStatement(reservationId)), entry)
}

export interface DoorPartyRow { holderName: string | null, partySize: number }

// Everything the verdict card is allowed to know about the people arriving: a name to greet them
// by and how many to expect through. No email, no price, no history (E-129 criterion 7).
export function doorPartyQuery(reservationId: string): SQL {
  return sql`
    SELECT u.name AS holderName, ${heldSeatsForReservation(sql`r.id`)} AS partySize
    FROM reservations r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.id = ${reservationId}
  `
}

export async function doorParty(reservationId: string): Promise<DoorPartyRow> {
  const [row] = await db.all<DoorPartyRow>(doorPartyQuery(reservationId))
  return row ?? { holderName: null, partySize: 0 }
}

export interface DoorPassRow {
  id: string
  reference: string
  holderName: string
  passTypeName: string
  passTypeSlug: string
  status: string
  passTypeStatus: string
  validFrom: number
  validUntil: number
  coversShow: number
  coveredCount: number
  anonymised: number
  tonightAt: number | null
  tonightStatus: string | null
  lastUsedTitle: string | null
  lastUsedAt: number | null
}

const DOOR_PASS_SEARCH_LIMIT = 10

// Pass mode's own lookup (D-126): a holder is found by name or by the reference on their pass,
// never by an id. Bound to a fixed six parameters however many passes the search matches (0006).
export function doorPassSearchQuery(term: string, performanceId: string, showId: string): SQL {
  const like = `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  return sql`
    SELECT p.id AS id, p.reference AS reference, u.name AS holderName,
           t.name AS passTypeName, t.slug AS passTypeSlug, p.status AS status,
           t.status AS passTypeStatus, t.valid_from AS validFrom, t.valid_until AS validUntil,
           (EXISTS (SELECT 1 FROM pass_type_shows s WHERE s.pass_type_id = t.id AND s.show_id = ${showId})
             OR t.slug = 'fellowship') AS coversShow,
           (SELECT count(*) FROM pass_type_shows s WHERE s.pass_type_id = t.id) AS coveredCount,
           u.anonymised_at IS NOT NULL AS anonymised,
           (SELECT a.admitted_at FROM pass_admissions a
             WHERE a.pass_id = p.id AND a.performance_id = ${performanceId}) AS tonightAt,
           (SELECT r.status FROM pass_admissions a
              JOIN tickets k ON k.id = a.ticket_id
              JOIN reservations r ON r.id = k.reservation_id
             WHERE a.pass_id = p.id AND a.performance_id = ${performanceId}) AS tonightStatus,
           (SELECT w.title FROM pass_admissions a
              JOIN performances f ON f.id = a.performance_id
              JOIN shows w ON w.id = f.show_id
             WHERE a.pass_id = p.id AND a.performance_id != ${performanceId}
             ORDER BY a.admitted_at DESC LIMIT 1) AS lastUsedTitle,
           (SELECT a.admitted_at FROM pass_admissions a
             WHERE a.pass_id = p.id AND a.performance_id != ${performanceId}
             ORDER BY a.admitted_at DESC LIMIT 1) AS lastUsedAt
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN users u ON u.id = p.user_id
    WHERE p.reference = ${term.toUpperCase()} OR u.name LIKE ${like} ESCAPE '\\'
    ORDER BY u.name COLLATE NOCASE
    LIMIT ${DOOR_PASS_SEARCH_LIMIT}
  `
}

export async function doorPassSearch(term: string, performanceId: string, showId: string): Promise<DoorPassRow[]> {
  return db.all<DoorPassRow>(doorPassSearchQuery(term, performanceId, showId))
}
