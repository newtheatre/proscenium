import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { doorWordingFor } from './access-profiles'
import { reservationSeatsSubquery } from './capacity'
import { HOLDING_STATUSES } from '#shared/utils/capacity'
import type { SQL } from 'drizzle-orm'

// The two blocks the glance shows beyond the house numbers: how many passes could still walk in,
// and who has told us in advance what they need at the door (E-112 criterion 1, D-127).

const holding = sql.raw(HOLDING_STATUSES.map(status => `'${status}'`).join(', '))

// A Fellowship covers everything the theatre puts on, the same rule pass redemption reads; this
// counts what could still be admitted, so a pass already used tonight is not pressure.
export function passPressureQuery(performanceId: string, showId: string, now: number): SQL {
  return sql`
    SELECT count(*) AS covering
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'ACTIVE'
      AND t.status != 'CLOSED'
      AND t.valid_from <= ${now} AND t.valid_until >= ${now}
      AND u.anonymised_at IS NULL
      AND (EXISTS (SELECT 1 FROM pass_type_shows s WHERE s.pass_type_id = t.id AND s.show_id = ${showId}) OR t.slug = 'fellowship')
      AND NOT EXISTS (SELECT 1 FROM pass_admissions a WHERE a.pass_id = p.id AND a.performance_id = ${performanceId})
  `
}

export async function passPressure(performanceId: string, showId: string, now = Math.floor(Date.now() / 1000)): Promise<number> {
  const [row] = await db.all<{ covering: number }>(passPressureQuery(performanceId, showId, now))
  return row?.covering ?? 0
}

export interface AccessBookingRow {
  userId: string
  name: string
  party: number
}

export interface AccessTonight {
  firstName: string
  party: number
  wording: string
}

// The bookings that hold an access or companion ticket, which is the same test the desk's own
// screen applies before it decrypts anything (D-127 criterion 3).
export function accessBookingsQuery(performanceId: string): SQL {
  return sql`
    SELECT r.user_id AS userId, u.name AS name, ${reservationSeatsSubquery(sql`r.id`)} AS party
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.performance_id = ${performanceId}
      AND r.status IN (${holding})
      AND EXISTS (
        SELECT 1 FROM tickets t
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.reservation_id = r.id AND t.refunded_at IS NULL AND tt.access_kind IS NOT NULL
      )
    ORDER BY u.name COLLATE NOCASE
  `
}

// First name and the agreed wording only: the flags themselves never leave the payload, so the
// screen shows what the officer wrote and nothing the patron did not consent to share (D-127).
export async function accessTonight(performanceId: string): Promise<AccessTonight[]> {
  const rows = await db.all<AccessBookingRow>(accessBookingsQuery(performanceId))
  const shown: AccessTonight[] = []
  for (const row of rows) {
    const wording = await doorWordingFor(row.userId)
    if (wording) shown.push({ firstName: row.name.trim().split(/\s+/)[0] ?? row.name, party: row.party, wording })
  }
  return shown
}
