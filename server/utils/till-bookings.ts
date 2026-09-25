import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsForReservation } from './capacity'
import { uncollectableReason } from '#shared/utils/desk'
import { looksLikeReference } from '#shared/utils/reservations'
import type { SQL } from 'drizzle-orm'
import type { TillBooking } from '#shared/utils/sale'

// The Tickets tab's reads (F-122 criteria 1, 2): a booking by id, reference or name, shaped for a
// bar screen. No email and no per-ticket price cross this line; what is owed does.

interface TillBookingRow {
  id: string
  reference: string
  status: string
  performanceId: string
  showTitle: string
  startsAt: number
  venueName: string
  bookerName: string | null
  partySize: number
  owedPence: number
}

const BOOKING_COLUMNS = sql`
  r.id AS id, r.reference AS reference, r.status AS status, r.performance_id AS performanceId,
  s.title AS showTitle, p.starts_at AS startsAt, v.name AS venueName, u.name AS bookerName,
  ${heldSeatsForReservation(sql`r.id`)} AS partySize,
  (SELECT coalesce(sum(t.price_paid), 0) FROM tickets t WHERE t.reservation_id = r.id AND t.refunded_at IS NULL) AS owedPence
`

// LEFT JOIN, because a walk-up sold with no name has no account behind it (D-115 criterion 6).
const BOOKING_FROM = sql`
  FROM reservations r
  JOIN performances p ON p.id = r.performance_id
  JOIN shows s ON s.id = p.show_id
  JOIN venues v ON v.id = p.venue_id
  LEFT JOIN users u ON u.id = r.user_id
`

export function tillBookingByIdQuery(id: string): SQL {
  return sql`SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE r.id = ${id}`
}

export function tillBookingByReferenceQuery(reference: string): SQL {
  return sql`SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE r.reference = ${reference.toUpperCase()}`
}

// A name search is bounded to one performance and a short page: the customer is standing at the
// counter, and a longer list is a typing problem, not a paging one (0003).
const NAME_MATCHES = 8

const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

export function tillBookingsByNameQuery(performanceId: string, name: string): SQL {
  return sql`
    SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM}
    WHERE r.performance_id = ${performanceId} AND u.name LIKE ${contains(name.trim())} ESCAPE '\\'
    ORDER BY u.name COLLATE NOCASE
    LIMIT ${NAME_MATCHES}
  `
}

function shape(row: TillBookingRow, tonightPerformanceIds: readonly string[]): TillBooking {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    performanceId: row.performanceId,
    showTitle: row.showTitle,
    startsAt: row.startsAt,
    venueName: row.venueName,
    isTonight: tonightPerformanceIds.includes(row.performanceId),
    bookerFirstName: row.bookerName?.trim().split(/\s+/)[0] ?? null,
    partySize: Number(row.partySize),
    owedPence: Number(row.owedPence),
    refusal: uncollectableReason(row.status),
  }
}

export async function tillBookingById(id: string, tonightPerformanceIds: readonly string[]): Promise<TillBooking | undefined> {
  const [row] = await db.all<TillBookingRow>(tillBookingByIdQuery(id))
  return row ? shape(row, tonightPerformanceIds) : undefined
}

// A reference finds the booking wherever its performance is, so an advance payment for another
// night is possible and flagged rather than hidden; a name only searches tonight's houses here.
export async function findTillBookings(q: string, tonightPerformanceIds: readonly string[]): Promise<TillBooking[]> {
  const trimmed = q.trim()
  if (looksLikeReference(trimmed)) {
    const [row] = await db.all<TillBookingRow>(tillBookingByReferenceQuery(trimmed))
    return row ? [shape(row, tonightPerformanceIds)] : []
  }
  const found: TillBooking[] = []
  for (const performanceId of tonightPerformanceIds) {
    const rows = await db.all<TillBookingRow>(tillBookingsByNameQuery(performanceId, trimmed))
    found.push(...rows.map(row => shape(row, tonightPerformanceIds)))
  }
  return found
}
