import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { doorWordingFor } from './access-profiles'
import { holdsLiveAccessTicket } from './tonight-glance'
import type { SQL } from 'drizzle-orm'

// The agreed access wording on the door's verdict (D-128 criterion 4, issue 1307). Only a booking
// holding a live access or companion ticket is ever read, the same test the desk applies (D-127).
export function doorAccessHolderQuery(reservationId: string): SQL {
  return sql`
    SELECT r.user_id AS userId
    FROM reservations r
    WHERE r.id = ${reservationId} AND r.user_id IS NOT NULL AND ${holdsLiveAccessTicket(sql`r.id`)}
  `
}

// The wording itself, or null: `doorWordingFor()` answers only a verified, consented and unexpired
// profile, so a booking whose holder withdrew shows nothing (D-127 criterion 2).
export async function doorAccessWording(reservationId: string): Promise<string | null> {
  const [row] = await db.all<{ userId: string }>(doorAccessHolderQuery(reservationId))
  return row ? doorWordingFor(row.userId) : null
}
