import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { looksLikeReference } from '#shared/utils/reservations'
import type { SQL } from 'drizzle-orm'

// The desk screen (D-114): finding today's performance and a booking against it. Kept free of
// what `collect()` needs (server/utils/desk-collection.ts), so `tests/` can import these under Bun.

export interface DeskPerformance {
  id: string
  showTitle: string
  venueName: string
  startsAt: number
}

// One night at a time, never the whole programme: a desk shift only ever needs the performances
// it is standing in front of.
export function performancesForNightQuery(night: string): SQL {
  return sql`
    SELECT p.id AS id, s.title AS showTitle, v.name AS venueName, p.starts_at AS startsAt
    FROM performances p
    JOIN shows s ON s.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    WHERE date(p.starts_at, 'unixepoch', '-4 hours') = ${night}
    ORDER BY p.starts_at
  `
}

export async function performancesForNight(night: string): Promise<DeskPerformance[]> {
  return db.all<DeskPerformance>(performancesForNightQuery(night))
}

// A typed percent sign is a character somebody is looking for, not a wildcard, matching the
// admin listings' own escaping (server/utils/ticket-types.ts).
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

export interface DeskSearchRow {
  id: string
  reference: string
  status: string
  bookerName: string
  totalPence: number
}

// Reference, an exact match on the no-look-alike code, or a name, a partial one on the booker's
// account: never both at once, because a reference is unambiguous and a name never is.
function searchPredicate(q: string | undefined): SQL {
  if (!q) return sql``
  const trimmed = q.trim()
  if (looksLikeReference(trimmed)) {
    return sql` AND r.reference = ${trimmed.toUpperCase()}`
  }
  return sql` AND u.name LIKE ${contains(trimmed)} ESCAPE '\\'`
}

export function deskSearchQuery(performanceId: string, q: string | undefined, limit: number, offset: number): SQL {
  return sql`
    SELECT r.id AS id, r.reference AS reference, r.status AS status, u.name AS bookerName,
           (SELECT coalesce(sum(t.price_paid), 0) FROM tickets t WHERE t.reservation_id = r.id AND t.refunded_at IS NULL) AS totalPence
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.performance_id = ${performanceId}${searchPredicate(q)}
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countDeskSearchQuery(performanceId: string, q: string | undefined): SQL {
  return sql`
    SELECT count(*) AS total
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.performance_id = ${performanceId}${searchPredicate(q)}
  `
}

export async function deskSearch(performanceId: string, q: string | undefined, limit: number, offset: number): Promise<DeskSearchRow[]> {
  return db.all<DeskSearchRow>(deskSearchQuery(performanceId, q, limit, offset))
}

export async function countDeskSearch(performanceId: string, q: string | undefined): Promise<number> {
  const [row] = await db.all<{ total: number }>(countDeskSearchQuery(performanceId, q))
  return Number(row?.total ?? 0)
}

export interface DeskTicketLine {
  ticketId: string
  ticketTypeName: string
  pricePaid: number
}

export interface DeskReservationDetail {
  id: string
  reference: string
  status: string
  showTitle: string
  startsAt: number
  bookerName: string
  bookerEmail: string
  tickets: DeskTicketLine[]
}

// Everything the collection screen shows in one read: who is being served, what they hold, and
// what it costs, priced from what each ticket actually snapshotted (D-104), never recomputed.
export function deskReservationQuery(id: string): SQL {
  return sql`
    SELECT r.id AS id, r.reference AS reference, r.status AS status,
           s.title AS showTitle, p.starts_at AS startsAt,
           u.name AS bookerName, u.email AS bookerEmail
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    JOIN shows s ON s.id = p.show_id
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ${id}
  `
}

export function deskTicketsQuery(reservationId: string): SQL {
  return sql`
    SELECT t.id AS ticketId, tt.name AS ticketTypeName, t.price_paid AS pricePaid
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE t.reservation_id = ${reservationId} AND t.refunded_at IS NULL
    ORDER BY t.id
  `
}

export async function deskReservation(id: string): Promise<DeskReservationDetail | undefined> {
  const [row] = await db.all<Omit<DeskReservationDetail, 'tickets'>>(deskReservationQuery(id))
  if (!row) return undefined
  const tickets = await db.all<DeskTicketLine>(deskTicketsQuery(id))
  return { ...row, tickets }
}
