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
