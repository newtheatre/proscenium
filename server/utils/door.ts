import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
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
