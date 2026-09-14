import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { doorWordingFor } from './access-profiles'
import { collectedSeatsSubquery, doorSeatsSubquery, heldAccessSeatsSubquery, heldSeatsOfKindSubquery, reservedSeatsSubquery, unpaidSeatsSubquery } from './capacity'
import { configValue } from './configuration'
import { pendingTicketCompRequestForReservation } from './ticket-comps'
import { holdExpiresAt, looksLikeReference, resolveHoldReleaseMinutes } from '#shared/utils/reservations'
import type { DeskStatusFilter } from '#shared/utils/desk'
import type { TicketTypeAccessKind } from '#shared/utils/ticket-types'
import type { TicketCompRequest } from '#shared/utils/ticket-comps'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

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

// The pills name the desk's own three states directly (Matt's ruling on #996): pending is
// reserved and unpaid, collected is reserved and paid, door is a walk-up with no reservation.
function statusPredicate(status: DeskStatusFilter): SQL {
  switch (status) {
    case 'PENDING': return sql` AND r.status = 'PENDING'`
    case 'COLLECTED': return sql` AND r.status = 'COLLECTED'`
    case 'DOOR': return sql` AND r.status = 'DOOR'`
    default: return sql``
  }
}

export function deskSearchQuery(performanceId: string, q: string | undefined, status: DeskStatusFilter, limit: number, offset: number): SQL {
  return sql`
    SELECT r.id AS id, r.reference AS reference, r.status AS status, u.name AS bookerName,
           (SELECT coalesce(sum(t.price_paid), 0) FROM tickets t WHERE t.reservation_id = r.id AND t.refunded_at IS NULL) AS totalPence
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.performance_id = ${performanceId}${searchPredicate(q)}${statusPredicate(status)}
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countDeskSearchQuery(performanceId: string, q: string | undefined, status: DeskStatusFilter): SQL {
  return sql`
    SELECT count(*) AS total
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.performance_id = ${performanceId}${searchPredicate(q)}${statusPredicate(status)}
  `
}

export async function deskSearch(performanceId: string, q: string | undefined, status: DeskStatusFilter, limit: number, offset: number): Promise<DeskSearchRow[]> {
  return db.all<DeskSearchRow>(deskSearchQuery(performanceId, q, status, limit, offset))
}

export async function countDeskSearch(performanceId: string, q: string | undefined, status: DeskStatusFilter): Promise<number> {
  const [row] = await db.all<{ total: number }>(countDeskSearchQuery(performanceId, q, status))
  return Number(row?.total ?? 0)
}

export interface DeskTicketLine {
  ticketId: string
  ticketTypeName: string
  pricePaid: number
  accessKind: TicketTypeAccessKind | null
}

export interface DeskReservationDetail {
  id: string
  reference: string
  status: string
  // Null except for a `CANCELLED` booking (D-118 criterion 5): a staff cancellation only ever
  // follows a refund, so it is never a hold to bring back the way a customer's own is.
  cancelledBy: string | null
  holdExpiresAt: number | null
  performanceId: string
  showTitle: string
  startsAt: number
  bookerName: string
  bookerEmail: string
  tickets: DeskTicketLine[]
  // The booking and nothing more: null unless it holds an access or companion ticket, whatever
  // else the booker's own profile carries (D-127 criterion 3, D-128 criterion 4).
  doorWording: string | null
  // The one still-open comp request against this booking, if any (D-117): what the screen
  // offers to request, or reads back to collect against once approved.
  compRequest: TicketCompRequest | null
}

// Everything the collection screen shows in one read: who is being served, what they hold, and
// what it costs, priced from what each ticket actually snapshotted (D-104), never recomputed.
export function deskReservationQuery(id: string): SQL {
  return sql`
    SELECT r.id AS id, r.reference AS reference, r.status AS status,
           r.cancelled_by AS cancelledBy, r.hold_expires_at AS holdExpiresAt, p.id AS performanceId,
           s.title AS showTitle, p.starts_at AS startsAt,
           r.user_id AS bookerUserId, u.name AS bookerName, u.email AS bookerEmail
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    JOIN shows s ON s.id = p.show_id
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ${id}
  `
}

export function deskTicketsQuery(reservationId: string): SQL {
  return sql`
    SELECT t.id AS ticketId, tt.name AS ticketTypeName, t.price_paid AS pricePaid, tt.access_kind AS accessKind
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE t.reservation_id = ${reservationId} AND t.refunded_at IS NULL
    ORDER BY t.id
  `
}

export interface DeskSummary {
  capacity: number | null
  reserved: number
  collected: number
  door: number
  unpaidCount: number
  unpaidOwedPence: number
  accessBookings: number
  passAdmissions: number
  reservationsReleaseAt: number
  onShift: string[]
}

// The five KPI tiles and the "Tonight" side card in one read, all scoped to the performance on
// screen (D-114, D-132): a shift only ever needs to know about the house it is standing in front of.
export function deskSummaryQuery(performanceId: string): SQL {
  return sql`
    SELECT p.starts_at AS startsAt, coalesce(p.capacity_override, v.capacity) AS capacity,
           p.hold_release_minutes_before AS holdReleaseMinutesBefore,
           ${reservedSeatsSubquery(sql`p.id`)} AS reserved,
           ${collectedSeatsSubquery(sql`p.id`)} AS collected,
           ${doorSeatsSubquery(sql`p.id`)} AS door,
           ${unpaidSeatsSubquery(sql`p.id`)} AS unpaidCount,
           (SELECT coalesce(sum(t.price_paid), 0) FROM tickets t JOIN reservations r ON r.id = t.reservation_id
              WHERE t.performance_id = p.id AND t.refunded_at IS NULL AND r.status = 'PENDING') AS unpaidOwedPence,
           ${heldAccessSeatsSubquery(sql`p.id`)} AS accessBookings,
           ${heldSeatsOfKindSubquery(sql`p.id`, 'PASS_ADMISSION')} AS passAdmissions
    FROM performances p
    JOIN venues v ON v.id = p.venue_id
    WHERE p.id = ${performanceId}
  `
}

// Confirmed duty managers, the one shift role box office already checks live for comp approval
// (`isDutyManagerOrTicketingManager`): no shift role names box office itself (`NIGHT_ROLES`).
export function onShiftQuery(performanceId: string): SQL {
  return sql`
    SELECT u.name AS name
    FROM shifts s
    JOIN users u ON u.id = s.user_id
    WHERE s.performance_id = ${performanceId} AND s.role = 'DUTY_MANAGER' AND s.status = 'CONFIRMED'
    ORDER BY u.name
  `
}

export async function deskSummary(event: H3Event | undefined, performanceId: string): Promise<DeskSummary | undefined> {
  const [row] = await db.all<{ startsAt: number, capacity: number | null, holdReleaseMinutesBefore: number | null } & Omit<DeskSummary, 'reservationsReleaseAt' | 'onShift'>>(
    deskSummaryQuery(performanceId),
  )
  if (!row) return undefined
  const { startsAt, holdReleaseMinutesBefore, ...counts } = row
  const releaseMinutes = resolveHoldReleaseMinutes(holdReleaseMinutesBefore, await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE'))
  const onShift = await db.all<{ name: string }>(onShiftQuery(performanceId))
  return {
    ...counts,
    reservationsReleaseAt: holdExpiresAt(startsAt, releaseMinutes),
    onShift: onShift.map(row => row.name),
  }
}

// The reference is unique across every performance (`reservations_reference`), so a scanned
// `/t/<ref>` needs no performance to scope it, the same as a signed token (criterion 8).
export function deskReservationIdByReferenceQuery(reference: string): SQL {
  return sql`SELECT r.id AS id FROM reservations r WHERE r.reference = ${reference.toUpperCase()}`
}

export async function deskReservationByReference(reference: string): Promise<DeskReservationDetail | undefined> {
  const [row] = await db.all<{ id: string }>(deskReservationIdByReferenceQuery(reference))
  return row ? deskReservation(row.id) : undefined
}

export async function deskReservation(id: string): Promise<DeskReservationDetail | undefined> {
  const [row] = await db.all<Omit<DeskReservationDetail, 'tickets' | 'doorWording' | 'compRequest'> & { bookerUserId: string }>(deskReservationQuery(id))
  if (!row) return undefined
  const tickets = await db.all<DeskTicketLine>(deskTicketsQuery(id))
  const { bookerUserId, ...detail } = row
  const holdsAccessTicket = tickets.some(ticket => ticket.accessKind !== null)
  const expiryMinutes = await configValue(undefined, 'COMP_REQUEST_EXPIRY_MINUTES')
  const compRequest = await pendingTicketCompRequestForReservation(id, expiryMinutes)
  return {
    ...detail,
    tickets,
    doorWording: holdsAccessTicket ? await doorWordingFor(bookerUserId) : null,
    compRequest: compRequest ?? null,
  }
}
