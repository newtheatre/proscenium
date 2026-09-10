import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { findByEmail, newId } from './accounts'
import { auditedWrite } from './audit'
import { capacityAllows, heldSeatsQuery, reservationIsPending, ticketAdditionQueries, ticketInsertQueries, ticketRemovalQueries } from './capacity'
import { auditEntry } from '#shared/utils/audit'
import { normaliseEmail } from '#shared/utils/auth'
import { HOLDING_STATUSES, capacityRefusal } from '#shared/utils/capacity'
import { generateReservationReference } from '#shared/utils/reservations'
import { resolvePrice } from '#shared/utils/ticket-types'
import type { TicketToWrite } from './capacity'
import type { CapacityRefusal } from '#shared/utils/capacity'
import type { ReservationSource, TicketTypeCount } from '#shared/utils/reservations'
import type { PriceSource, TicketTypeAccessKind, TicketTypeRestriction } from '#shared/utils/ticket-types'
import type { SQL } from 'drizzle-orm'

// Resolving what a performance may sell and writing what it sold (D-104). The predicate that
// gates capacity is D-105's; this is the one place that assembles an order against it.

export interface BookableTicketTypeRow {
  id: string
  name: string
  description: string | null
  basePrice: number
  activeByDefault: number
  showPrice: number | null
  showActive: number | null
  performancePrice: number | null
  performanceActive: number | null
  restrictedTo: TicketTypeRestriction | null
  accessKind: TicketTypeAccessKind | null
}

export interface BookableTicketType {
  id: string
  name: string
  description: string | null
  price: number
  source: PriceSource
  restrictedTo: TicketTypeRestriction | null
  accessKind: TicketTypeAccessKind | null
}

const readFlag = (value: number | null): boolean | null => (value === null ? null : value === 1)

// Resolved down the same chain the listing reads, so a quoted price never differs from the
// write path's. A member-restricted type is dropped for a caller who is not one (D-109 criterion 1).
export function readBookableTicketTypes(rows: BookableTicketTypeRow[], isMember: boolean): BookableTicketType[] {
  return rows.flatMap((row) => {
    if (row.restrictedTo === 'MEMBER' && !isMember) return []
    const resolved = resolvePrice(
      { price: row.basePrice, activeByDefault: row.activeByDefault === 1 },
      row.showPrice === null && row.showActive === null ? null : { price: row.showPrice, active: readFlag(row.showActive) },
      row.performancePrice === null && row.performanceActive === null
        ? null
        : { price: row.performancePrice, active: readFlag(row.performanceActive) },
    )
    if (!resolved.active) return []
    return [{
      id: row.id, name: row.name, description: row.description, price: resolved.price,
      source: resolved.source, restrictedTo: row.restrictedTo, accessKind: row.accessKind,
    }]
  })
}

// Nobody but an entitled booker is ever sent an access or companion row: `includeAccessTypes`
// gates it here, not by filtering the response afterward (D-128 criterion 1).
export function bookableTicketTypesQuery(performanceId: string, showId: string, includeAccessTypes: boolean): SQL {
  const accessFilter = includeAccessTypes ? sql`` : sql` AND t.access_kind IS NULL`
  return sql`
    SELECT t.id AS id, t.name AS name, t.description AS description, t.price AS basePrice,
           t.active_by_default AS activeByDefault, t.restricted_to AS restrictedTo, t.access_kind AS accessKind,
           so.price AS showPrice, so.active AS showActive,
           po.price AS performancePrice, po.active AS performanceActive
    FROM ticket_types t
    LEFT JOIN show_ticket_overrides so ON so.show_id = ${showId} AND so.ticket_type_id = t.id
    LEFT JOIN performance_ticket_overrides po ON po.performance_id = ${performanceId} AND po.ticket_type_id = t.id
    WHERE t.archived = 0 AND t.kind = 'SINGLE'${accessFilter}
    ORDER BY t.price, t.name COLLATE NOCASE
  `
}

export async function bookableTicketTypes(performanceId: string, showId: string, isMember: boolean, includeAccessTypes = false): Promise<BookableTicketType[]> {
  return readBookableTicketTypes(await db.all<BookableTicketTypeRow>(bookableTicketTypesQuery(performanceId, showId, includeAccessTypes)), isMember)
}

export interface HeldAccessCounts {
  access: number
  companion: number
}

// What this booker already holds for this performance, any source, unrefunded: the "have" side
// of the entitlement check, counted fresh rather than trusted from an earlier read (D-128 criterion 2).
export function heldAccessCountsQuery(userId: string, performanceId: string): SQL {
  return sql`
    SELECT tt.access_kind AS accessKind, count(*) AS n
    FROM tickets t
    JOIN reservations r ON r.id = t.reservation_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE r.user_id = ${userId} AND t.performance_id = ${performanceId} AND t.refunded_at IS NULL
      AND r.status IN (${sql.raw(HOLDING_STATUSES.map(status => `'${status}'`).join(', '))})
      AND tt.access_kind IS NOT NULL
    GROUP BY tt.access_kind
  `
}

export async function heldAccessCounts(userId: string, performanceId: string): Promise<HeldAccessCounts> {
  const rows = await db.all<{ accessKind: TicketTypeAccessKind, n: number }>(heldAccessCountsQuery(userId, performanceId))
  const access = rows.find(row => row.accessKind === 'ACCESS')?.n ?? 0
  const companion = rows.find(row => row.accessKind === 'COMPANION')?.n ?? 0
  return { access: Number(access), companion: Number(companion) }
}

export interface ReservationLineToWrite {
  ticketTypeId: string
  quantity: number
  pricePaid: number
  priceSource: PriceSource
}

export interface WriteReservationInput {
  performanceId: string
  userId: string | null
  source: ReservationSource
  // True only for a desk booking made after the customer window had already closed
  // (D-112 criterion 3); every other channel writes false.
  windowBypassed: boolean
  lines: ReservationLineToWrite[]
  capacity: number | null
  // When this unpaid hold releases; null never expires, which is what a paid or desk-collected
  // booking wants once D-114 clears it (D-106 criterion 1).
  holdExpiresAt: number | null
}

export interface WrittenTicket {
  id: string
  ticketTypeId: string
  pricePaid: number
}

export interface WriteReservationResult {
  // The QR token is minted from this id by the caller (`qrTokenFor()`), not here: this file
  // stays free of anything that needs a worker secret, so `tests/` can import it under Bun.
  id: string
  reference: string
  // The tickets the batch actually wrote: fewer than requested means the capacity predicate on
  // at least one statement did not match, and the whole order wrote none of itself (D-105).
  tickets: WrittenTicket[]
  requested: number
}

export interface GuestAccountResult {
  id: string
  created: boolean
}

// An existing address, guest or full, is reused as it stands; a new one is a claimable guest
// account (D-104 criteria 1, 6). The reservation succeeds identically either way (enumeration-safe).
export async function guestAccount(email: string, name: string): Promise<GuestAccountResult> {
  const existing = await findByEmail(email)
  if (existing) return { id: existing.id, created: false }

  const normalised = normaliseEmail(email)
  const id = newId()
  const entry = auditEntry({ actorId: null, action: 'account.created.guest', target: `user:${id}` })

  // Two concurrent checkouts can both pass the read above, so the insert itself carries the
  // conflict guard, and the audit rides `changes()` rather than trusting the read (0006, 0049).
  const created = await auditedWrite(
    db.all<{ id: string }>(sql`
      INSERT INTO users (id, email, name) VALUES (${id}, ${normalised}, ${name.trim()})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `),
    entry,
  )
  if (created) return { id, created: true }

  // Lost the race: somebody else's checkout won between the read above and this insert.
  const winner = await findByEmail(email)
  return { id: winner!.id, created: false }
}

// Every ticket statement carries the identical capacity condition: all match or none does
// (D-104 criterion 3, D-105 criterion 1). The reservation row is unconditional; the caller decides.
export async function writeReservation(input: WriteReservationInput): Promise<WriteReservationResult> {
  const id = newId()
  const reference = generateReservationReference()

  const tickets: (TicketToWrite & { ticketTypeId: string })[] = input.lines.flatMap(line =>
    Array.from({ length: line.quantity }, () => ({
      id: newId(),
      reservationId: id,
      performanceId: input.performanceId,
      ticketTypeId: line.ticketTypeId,
      pricePaid: line.pricePaid,
      priceSource: line.priceSource,
    })))

  const reservationInsert = sql`
    INSERT INTO reservations (id, reference, performance_id, user_id, status, source, window_bypassed, hold_expires_at)
    VALUES (${id}, ${reference}, ${input.performanceId}, ${input.userId}, 'PENDING', ${input.source}, ${input.windowBypassed}, ${input.holdExpiresAt})
  `

  const [, ...ticketRows] = await db.batch([
    db.run(reservationInsert),
    ...ticketInsertQueries(tickets, input.capacity).map(statement => db.all<{ id: string }>(statement)),
  ])

  const written: WrittenTicket[] = []
  for (const [index, rows] of ticketRows.entries()) {
    if (rows.length > 0) {
      const ticket = tickets[index]!
      written.push({ id: rows[0]!.id, ticketTypeId: ticket.ticketTypeId, pricePaid: ticket.pricePaid })
    }
  }

  // A refused order holds nothing, so the row it left behind says so rather than sitting as an
  // indefinite PENDING hold that no sweep, present or future, has any reason to ever touch.
  if (written.length < tickets.length) {
    await db.run(sql`UPDATE reservations SET status = 'CANCELLED', updated_at = unixepoch() WHERE id = ${id} AND status = 'PENDING'`)
  }

  return { id, reference, tickets: written, requested: tickets.length }
}

// The message a refused order quotes, read fresh after the batch: the decision already happened
// atomically inside it, so this is only ever for what the response tells the booker.
export async function currentCapacityRefusal(performanceId: string, capacity: number | null, wanted: number): Promise<CapacityRefusal | null> {
  const [row] = await db.all<{ held: number }>(heldSeatsQuery(performanceId))
  return capacityRefusal(capacity, Number(row?.held ?? 0), wanted)
}

export interface ReservationForResend {
  id: string
  userId: string | null
  reference: string
  status: string
  showTitle: string
  startsAt: number
  totalPence: number
}

// Everything a resend needs in one row: the booker (to check the email match), the template
// fields, and the total, summed here rather than trusting a client-supplied figure.
export function reservationForResendQuery(reference: string): SQL {
  return sql`
    SELECT r.id AS id, r.user_id AS userId, r.reference AS reference, r.status AS status,
           s.title AS showTitle, p.starts_at AS startsAt,
           (SELECT coalesce(sum(t.price_paid), 0) FROM tickets t WHERE t.reservation_id = r.id) AS totalPence
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    JOIN shows s ON s.id = p.show_id
    WHERE r.reference = ${reference}
  `
}

export async function reservationForResend(reference: string): Promise<ReservationForResend | undefined> {
  const [row] = await db.all<ReservationForResend>(reservationForResendQuery(reference))
  return row
}

export interface ReservationCurrentState {
  reference: string
  status: string
  cancelledBy: string | null
  showTitle: string
  startsAt: number
  totalPence: number
}

// What the QR answers when it is presented: live, from this row, never from anything saved
// earlier (D-108 criterion 1). "Exchanged" and "wrong night" await D-111 and D-126.
export function reservationCurrentStateQuery(id: string): SQL {
  return sql`
    SELECT r.reference AS reference, r.status AS status, r.cancelled_by AS cancelledBy,
           s.title AS showTitle, p.starts_at AS startsAt,
           (SELECT coalesce(sum(t.price_paid), 0) FROM tickets t WHERE t.reservation_id = r.id) AS totalPence
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    JOIN shows s ON s.id = p.show_id
    WHERE r.id = ${id}
  `
}

export async function reservationCurrentState(id: string): Promise<ReservationCurrentState | undefined> {
  const [row] = await db.all<ReservationCurrentState>(reservationCurrentStateQuery(id))
  return row
}

export interface SelfServiceReservation {
  id: string
  status: string
  userId: string | null
  performanceId: string
  showId: string
  startsAt: number
}

// What every self-service write (D-110, D-111) needs to decide and price against: the
// reservation's own state plus enough of its performance to re-run capacity and sale checks.
export function selfServiceReservationQuery(id: string): SQL {
  return sql`
    SELECT r.id AS id, r.status AS status, r.user_id AS userId, r.performance_id AS performanceId,
           p.show_id AS showId, p.starts_at AS startsAt
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    WHERE r.id = ${id}
  `
}

export async function selfServiceReservation(id: string): Promise<SelfServiceReservation | undefined> {
  const [row] = await db.all<SelfServiceReservation>(selfServiceReservationQuery(id))
  return row
}

// Grouped by type, unrefunded only: the "have" side of D-110's edit delta (criterion 1).
export function currentTicketLinesQuery(reservationId: string): SQL {
  return sql`
    SELECT ticket_type_id AS ticketTypeId, count(*) AS quantity
    FROM tickets
    WHERE reservation_id = ${reservationId} AND refunded_at IS NULL
    GROUP BY ticket_type_id
  `
}

export async function currentTicketLines(reservationId: string): Promise<TicketTypeCount[]> {
  return db.all<TicketTypeCount>(currentTicketLinesQuery(reservationId))
}

export interface NamedTicketLine extends TicketTypeCount {
  ticketTypeName: string
}

// The same grouping, named for a screen rather than a write path.
export function namedTicketLinesQuery(reservationId: string): SQL {
  return sql`
    SELECT t.ticket_type_id AS ticketTypeId, tt.name AS ticketTypeName, count(*) AS quantity
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE t.reservation_id = ${reservationId} AND t.refunded_at IS NULL
    GROUP BY t.ticket_type_id, tt.name
    ORDER BY tt.name COLLATE NOCASE
  `
}

export async function namedTicketLines(reservationId: string): Promise<NamedTicketLine[]> {
  return db.all<NamedTicketLine>(namedTicketLinesQuery(reservationId))
}

export interface EditReservationTicketsInput {
  reservationId: string
  performanceId: string
  capacity: number | null
  additions: (TicketToWrite & { ticketTypeId: string })[]
  removals: TicketTypeCount[]
  desiredTotal: number
  // The booker themselves: self-service has no officer to name (`self: true`, shared/utils/audit-actions.ts).
  actorId: string | null
}

export interface EditReservationTicketsResult {
  applied: boolean
}

// Every added and removed line shares one guard, evaluated against the *desired total*, not the
// delta: capacity is asked once, for the shape the booking ends up in (D-110 criterion 2).
export async function editReservationTickets(input: EditReservationTicketsInput): Promise<EditReservationTicketsResult> {
  const guard = sql`${capacityAllows(input.performanceId, input.capacity, input.desiredTotal, input.reservationId)} AND ${reservationIsPending(input.reservationId)}`

  await db.batch([
    db.run(sql`UPDATE reservations SET updated_at = unixepoch() WHERE id = ${input.reservationId} AND status = 'PENDING'`),
    ...ticketAdditionQueries(input.additions, guard).map(statement => db.run(statement)),
    ...ticketRemovalQueries(input.reservationId, input.removals, guard).map(statement => db.run(statement)),
  ])

  // Read back rather than trusted: the guard is identical everywhere, so the final total is
  // either the desired one or nothing moved (criterion 2). The audit rides that same fact.
  const after = await currentTicketLines(input.reservationId)
  const total = after.reduce((sum, line) => sum + line.quantity, 0)
  const applied = total === input.desiredTotal

  if (applied) {
    const entry = auditEntry({
      actorId: input.actorId,
      action: 'reservation.tickets-changed',
      target: `reservation:${input.reservationId}`,
      detail: { desiredTotal: input.desiredTotal },
    })
    await db.run(sql`INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)})`)
  }

  return { applied }
}

// The hold releases the instant status leaves `HOLDING_STATUSES`, so cancelling frees capacity
// with no separate sweep (D-110 criterion 3), the same shape D-106's own release uses.
export async function cancelReservation(reservationId: string, actorId: string | null): Promise<boolean> {
  const entry = auditEntry({ actorId, action: 'reservation.cancelled', target: `reservation:${reservationId}` })
  return auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE reservations SET status = 'CANCELLED', cancelled_by = 'CUSTOMER', hold_expires_at = NULL, updated_at = unixepoch()
      WHERE id = ${reservationId} AND status = 'PENDING'
      RETURNING id
    `),
    entry,
  )
}

export interface ReinstateWriteInput {
  reservationId: string
  performanceId: string
  actorId: string
  reason: string
  ticketCount: number
  capacity: number | null
  freshHoldExpiresAt: number
  // Carried onto the history row so D-106's own record of the lapse survives this write
  // overwriting the columns it came from (criterion 2).
  previousStatus: string
  previousHoldExpiresAt: number | null
}

export interface ReinstateWriteResult {
  applied: boolean
}

// The predicate and the write are one statement (0003): an expired hold or the booker's own
// cancellation, and room for it, re-checked live rather than trusted from an earlier read.
export function reinstateReservationStatement(
  reservationId: string,
  performanceId: string,
  capacity: number | null,
  ticketCount: number,
  freshHoldExpiresAt: number,
): SQL {
  return sql`
    UPDATE reservations
    SET status = 'PENDING', cancelled_by = NULL, hold_expires_at = ${freshHoldExpiresAt}, updated_at = unixepoch()
    WHERE id = ${reservationId}
      AND (status = 'EXPIRED' OR (status = 'CANCELLED' AND cancelled_by = 'CUSTOMER'))
      AND ${capacityAllows(performanceId, capacity, ticketCount)}
    RETURNING id
  `
}

// The claim, not the read, decides (0003): the capacity predicate rides the same UPDATE that
// flips status, so a house that filled while the officer was deciding writes nothing at all.
export async function reinstateReservation(input: ReinstateWriteInput): Promise<ReinstateWriteResult> {
  const historyId = newId()

  const update = reinstateReservationStatement(
    input.reservationId,
    input.performanceId,
    input.capacity,
    input.ticketCount,
    input.freshHoldExpiresAt,
  )

  // Chained on the UPDATE's own `changes()`: a refused reinstatement leaves no history row and
  // no audit trail for something that did not happen (0049's shape, extended one link further).
  const historyInsert = sql`
    INSERT INTO reservation_reinstatements (id, reservation_id, actor_id, reason, previous_status, previous_hold_expires_at)
    SELECT ${historyId}, ${input.reservationId}, ${input.actorId}, ${input.reason}, ${input.previousStatus}, ${input.previousHoldExpiresAt}
    WHERE changes() = 1
    RETURNING id
  `

  // No `reason` in detail: that is free text and belongs on the history row, which the target
  // id already points at (0011).
  const entry = auditEntry({ actorId: input.actorId, action: 'reservation.reinstated', target: `reservation:${input.reservationId}` })

  const [updateRows] = await db.batch([
    db.all<{ id: string }>(update),
    db.all<{ id: string }>(historyInsert),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, NULL
      WHERE changes() = 1
    `),
  ])

  return { applied: Array.isArray(updateRows) && updateRows.length > 0 }
}
