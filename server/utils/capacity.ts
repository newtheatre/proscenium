import { sql } from 'drizzle-orm'
import { HOLDING_STATUSES } from '#shared/utils/capacity'
import { performanceSoldQuery, soldReferences } from './programme'
import type { TicketPriceSource } from '#shared/utils/ticket-types'
import type { PerformanceReference } from './programme'
import type { TicketTypeCount } from '#shared/utils/reservations'
import type { TicketTypeReference } from './ticket-types'
import type { SQL } from 'drizzle-orm'

// The capacity rule as statements (D-105, 0006). Capacity is never counted in the application and
// then written: every path that takes a seat carries the check on its own statement.

// D-104 builds these two tables. The rule that reads them is fixed here first, so the write path
// consumes a predicate rather than inventing one (docs/data-model.md, build-order wave 1).
export const TICKETS = 'tickets'
export const RESERVATIONS = 'reservations'

const holding = sql.raw(HOLDING_STATUSES.map(status => `'${status}'`).join(', '))

// Every count in this file aliases its own tables privately: a bare `r` or `t` would capture a
// caller's, which is how a party once read the whole house (#1295).

// A ticket occupies a seat while its reservation still holds one and it has not been refunded.
// `except` leaves one reservation's own seats out, which is what makes a whole order atomic below.
export function heldSeatsSubquery(performanceId: SQL, except?: string): SQL {
  const ours = except === undefined ? sql`` : sql` AND held_t.reservation_id <> ${except}`
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} held_t
    JOIN ${sql.raw(RESERVATIONS)} held_r ON held_r.id = held_t.reservation_id
    WHERE held_t.performance_id = ${performanceId}
      AND held_t.refunded_at IS NULL
      AND held_r.status IN (${holding})${ours}
  )`
}

export function heldSeatsQuery(performanceId: string): SQL {
  return sql`SELECT ${heldSeatsSubquery(sql`${performanceId}`)} AS held`
}

// The same predicate correlated to one booking: its party, where a row count would call a refunded
// seat somebody arriving. Its own aliases, so a caller's `r.id` binds to the caller's row (#1295).
export function heldSeatsForReservation(reservationId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} party_t
    JOIN ${sql.raw(RESERVATIONS)} party_r ON party_r.id = party_t.reservation_id
    WHERE party_t.reservation_id = ${reservationId}
      AND party_t.refunded_at IS NULL
      AND party_r.status IN (${holding})
  )`
}

// The same count correlated to a row already in hand, for a listing that reads many performances
// at once without binding a parameter per performance (0006).
export function heldSeatsColumn(alias: string): SQL {
  return heldSeatsSubquery(sql`${sql.raw(alias)}.id`)
}

// A ticket standing on a pass admission (D-125): it owes nothing, though its booking stays PENDING
// (issue 1390). The one test every "made with a pass" and "still owes" reading shares.
export function ticketOnPass(ticketId: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM pass_admissions pass_a WHERE pass_a.ticket_id = ${ticketId})`
}

export function passBookingColumn(alias: string): SQL {
  return sql`EXISTS (SELECT 1 FROM ${sql.raw(TICKETS)} pass_t WHERE pass_t.reservation_id = ${sql.raw(alias)}.id AND ${ticketOnPass(sql`pass_t.id`)})`
}

// Seats held but not yet paid for: a PENDING reservation is somebody coming who still owes the
// desk, which is the queue D-132 criterion 2 names. A pass seat owes nothing, so it is not one.
export function unpaidSeatsSubquery(performanceId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} unpaid_t
    JOIN ${sql.raw(RESERVATIONS)} unpaid_r ON unpaid_r.id = unpaid_t.reservation_id
    WHERE unpaid_t.performance_id = ${performanceId}
      AND unpaid_t.refunded_at IS NULL
      AND unpaid_r.status = 'PENDING'
      AND NOT ${ticketOnPass(sql`unpaid_t.id`)}
  )`
}

// Correlated to a row already in hand, so a listing reads many performances without binding a
// parameter per performance (0006).
export function unpaidSeatsColumn(alias: string): SQL {
  return unpaidSeatsSubquery(sql`${sql.raw(alias)}.id`)
}

// Seats through the door: admission sets DOOR on any booking, a walk-up's included, so this is
// "in" and never a count of walk-ups (D-114 criterion 7, issue 1326).
export function admittedSeatsSubquery(performanceId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} admitted_t
    JOIN ${sql.raw(RESERVATIONS)} admitted_r ON admitted_r.id = admitted_t.reservation_id
    WHERE admitted_t.performance_id = ${performanceId}
      AND admitted_t.refunded_at IS NULL
      AND admitted_r.status = 'DOOR'
  )`
}

// The admitted share of the night's walk-ups: seats through the door on a door-source booking,
// which the night report counts beside "in" without counting a walk-up sold but not yet in (D-126).
export function admittedWalkUpSeatsSubquery(performanceId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} t
    JOIN ${sql.raw(RESERVATIONS)} r ON r.id = t.reservation_id
    WHERE t.performance_id = ${performanceId}
      AND t.refunded_at IS NULL
      AND r.status = 'DOOR'
      AND r.source = 'DOOR'
  )`
}

// Seats owing nothing, never admitted and not refunded: a no-show, derived and never written, so it
// falls as the door admits people (issue 1296). A pass seat owes nothing though it stays PENDING.
export function noShowSeatsSubquery(performanceId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} t
    JOIN ${sql.raw(RESERVATIONS)} r ON r.id = t.reservation_id
    WHERE t.performance_id = ${performanceId}
      AND t.refunded_at IS NULL
      AND (r.status IN ('NO_SHOW', 'COLLECTED') OR (r.status = 'PENDING' AND ${ticketOnPass(sql`t.id`)}))
  )`
}

// Seats for a booking made on the night (a desk or till sale, or a pass admitted on the spot),
// known by the booking's source rather than by its status, and still held.
export function walkUpSeatsSubquery(performanceId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} walkup_t
    JOIN ${sql.raw(RESERVATIONS)} walkup_r ON walkup_r.id = walkup_t.reservation_id
    WHERE walkup_t.performance_id = ${performanceId}
      AND walkup_t.refunded_at IS NULL
      AND walkup_r.source = 'DOOR'
      AND walkup_r.status IN (${holding})
  )`
}

// Held seats of one ticket-type kind, for the desk's "Tonight" card (D-132): a row is not a seat
// until the same holding predicate the capacity rule uses says it is (D-105 criterion 2).
export function heldSeatsOfKindSubquery(performanceId: SQL, kind: string): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} kind_t
    JOIN ${sql.raw(RESERVATIONS)} kind_r ON kind_r.id = kind_t.reservation_id
    JOIN ticket_types kind_tt ON kind_tt.id = kind_t.ticket_type_id
    WHERE kind_t.performance_id = ${performanceId}
      AND kind_t.refunded_at IS NULL
      AND kind_r.status IN (${holding})
      AND kind_tt.kind = ${kind}
  )`
}

// Held seats whose type carries an access kind at all, whichever one (D-128).
export function heldAccessSeatsSubquery(performanceId: SQL): SQL {
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} access_t
    JOIN ${sql.raw(RESERVATIONS)} access_r ON access_r.id = access_t.reservation_id
    JOIN ticket_types access_tt ON access_tt.id = access_t.ticket_type_id
    WHERE access_t.performance_id = ${performanceId}
      AND access_t.refunded_at IS NULL
      AND access_r.status IN (${holding})
      AND access_tt.access_kind IS NOT NULL
  )`
}

// The same count for a whole show, scoped through its performances by subquery rather than by an
// id list read back from a result set (0006).
export function showUnpaidSeatsColumn(alias: string): SQL {
  return sql`(
    SELECT coalesce(sum(${unpaidSeatsSubquery(sql`show_p.id`)}), 0)
    FROM performances show_p WHERE show_p.show_id = ${sql.raw(alias)}.id
  )`
}

// True while the house can still take `seats` more, counting everybody but `except`. A caller
// appends this to its own WHERE, so the check and the write are one statement (D-105 criterion 2).
export function capacityAllows(performanceId: string, capacity: number | null, seats: number, except?: string): SQL {
  if (capacity === null) return sql`1 = 1`
  return sql`${heldSeatsSubquery(sql`${performanceId}`, except)} <= ${capacity - seats}`
}

// True while lowering to `capacity` would not put the house under what is already held, through
// the same classified registry as every sold count: a no-op until D-104 registers `tickets`.
export function loweringPredicate(performanceId: string, capacity: number | null, references = soldReferences()): SQL {
  if (capacity === null) return sql`1 = 1`
  return sql`(${performanceSoldQuery(performanceId, references)}) <= ${capacity}`
}

// The two registry rows D-104 adds when it migrates the tables. They are written here so that
// classifying `tickets` is pushing a constant rather than deciding the rule again (D-105).
export const TICKETS_HOLD_SEATS: PerformanceReference = {
  table: TICKETS,
  column: 'performance_id',
  sold: true,
  // A bare row count would call an expired hold a sold seat, which is what closes a house that is
  // in fact empty. The count is the capacity rule and nothing else.
  heldBy: performanceId => heldSeatsSubquery(performanceId),
  why: 'a seat somebody holds: the performance may be cancelled and refunded, never deleted',
}

export const TICKETS_ARE_A_SALE: TicketTypeReference = {
  table: TICKETS,
  column: 'ticket_type_id',
  // Every ticket row counts, refunded ones included: "has ever been sold" is about history, not
  // about the house tonight (D-119 criterion 2).
  sale: true,
  why: 'a seat sold under this type, so the type resolves for it forever and may only be archived',
}

// True while `reservationId` is still an open, unpaid hold: the guard every self-service write
// shares, so a race that collects or cancels mid-edit loses the edit rather than corrupting it.
export function reservationIsPending(reservationId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM ${sql.raw(RESERVATIONS)} WHERE id = ${reservationId} AND status = 'PENDING')`
}

export interface TicketToWrite {
  id: string
  reservationId: string
  performanceId: string
  ticketTypeId: string
  // Integer pence, snapshotted from the resolved chain so a later override never reprices it
  // (D-120 criterion 3).
  pricePaid: number
  priceSource: TicketPriceSource
}

// One order, all of it or none of it: every statement carries the identical condition, over a
// count our own inserts cannot move, so a refused order writes none of itself (D-105 criterion 1).
export function ticketInsertQueries(tickets: TicketToWrite[], capacity: number | null): SQL[] {
  const reservations = new Set(tickets.map(ticket => ticket.reservationId))
  if (reservations.size > 1) {
    throw new Error('one order is one reservation: the capacity condition is scoped to it (D-105)')
  }
  const performances = new Set(tickets.map(ticket => ticket.performanceId))
  if (performances.size > 1) {
    throw new Error('one order is one performance: capacity is a fact about one house (E-127)')
  }

  // RETURNING id is what lets a caller decide the winner from the write itself: a row present
  // means this statement's own predicate matched, never a stored actor compared after the fact.
  return tickets.map(ticket => sql`
    INSERT INTO ${sql.raw(TICKETS)} (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
    SELECT ${ticket.id}, ${ticket.reservationId}, ${ticket.performanceId}, ${ticket.ticketTypeId},
           ${ticket.pricePaid}, ${ticket.priceSource}
    WHERE ${capacityAllows(ticket.performanceId, capacity, tickets.length, ticket.reservationId)}
    RETURNING id
  `)
}

// One seat, one guard beyond capacity: D-125's `passAdmissionAllows` names the pass's own terms
// and the once-per-performance rule, this file's job is only ever the seat itself (D-105 criterion 2).
export function passAdmissionTicketInsert(ticket: TicketToWrite, extraGuard: SQL, capacity: number | null): SQL {
  return sql`
    INSERT INTO ${sql.raw(TICKETS)} (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
    SELECT ${ticket.id}, ${ticket.reservationId}, ${ticket.performanceId}, ${ticket.ticketTypeId},
           ${ticket.pricePaid}, ${ticket.priceSource}
    WHERE ${capacityAllows(ticket.performanceId, capacity, 1, ticket.reservationId)} AND ${extraGuard}
    RETURNING id
  `
}

// D-110's edit: every added and removed line shares one guard, precomputed by the caller against
// the desired total rather than the delta, so a mixed add-and-remove request is all or nothing.
export function ticketAdditionQueries(tickets: TicketToWrite[], guard: SQL): SQL[] {
  return tickets.map(ticket => sql`
    INSERT INTO ${sql.raw(TICKETS)} (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
    SELECT ${ticket.id}, ${ticket.reservationId}, ${ticket.performanceId}, ${ticket.ticketTypeId},
           ${ticket.pricePaid}, ${ticket.priceSource}
    WHERE ${guard}
    RETURNING id
  `)
}

// A subquery-scoped id list, never an `IN` list built from a result set (0001): the rows removed
// are whichever unrefunded tickets of that type happen to exist, since none is distinguished.
export function ticketRemovalQueries(reservationId: string, removals: TicketTypeCount[], guard: SQL): SQL[] {
  return removals.map(removal => sql`
    DELETE FROM ${sql.raw(TICKETS)}
    WHERE id IN (
      SELECT id FROM ${sql.raw(TICKETS)}
      WHERE reservation_id = ${reservationId} AND ticket_type_id = ${removal.ticketTypeId} AND refunded_at IS NULL
      LIMIT ${removal.quantity}
    ) AND ${guard}
    RETURNING id
  `)
}
