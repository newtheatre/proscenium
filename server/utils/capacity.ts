import { sql } from 'drizzle-orm'
import { HOLDING_STATUSES } from '#shared/utils/capacity'
import { performanceSoldQuery, soldReferences } from './programme'
import type { TicketPriceSource } from '#shared/utils/ticket-types'
import type { PerformanceReference } from './programme'
import type { TicketTypeReference } from './ticket-types'
import type { SQL } from 'drizzle-orm'

// The capacity rule as statements (D-105, 0006). Capacity is never counted in the application and
// then written: every path that takes a seat carries the check on its own statement.

// D-104 builds these two tables. The rule that reads them is fixed here first, so the write path
// consumes a predicate rather than inventing one (docs/data-model.md, build-order wave 1).
export const TICKETS = 'tickets'
export const RESERVATIONS = 'reservations'

const holding = sql.raw(HOLDING_STATUSES.map(status => `'${status}'`).join(', '))

// A ticket occupies a seat while its reservation still holds one and it has not been refunded.
// `except` leaves one reservation's own seats out, which is what makes a whole order atomic below.
export function heldSeatsSubquery(performanceId: SQL, except?: string): SQL {
  const ours = except === undefined ? sql`` : sql` AND t.reservation_id <> ${except}`
  return sql`(
    SELECT count(*) FROM ${sql.raw(TICKETS)} t
    JOIN ${sql.raw(RESERVATIONS)} r ON r.id = t.reservation_id
    WHERE t.performance_id = ${performanceId}
      AND t.refunded_at IS NULL
      AND r.status IN (${holding})${ours}
  )`
}

export function heldSeatsQuery(performanceId: string): SQL {
  return sql`SELECT ${heldSeatsSubquery(sql`${performanceId}`)} AS held`
}

// The same count correlated to a row already in hand, for a listing that reads many performances
// at once without binding a parameter per performance (0006).
export function heldSeatsColumn(alias: string): SQL {
  return heldSeatsSubquery(sql`${sql.raw(alias)}.id`)
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

  return tickets.map(ticket => sql`
    INSERT INTO ${sql.raw(TICKETS)} (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
    SELECT ${ticket.id}, ${ticket.reservationId}, ${ticket.performanceId}, ${ticket.ticketTypeId},
           ${ticket.pricePaid}, ${ticket.priceSource}
    WHERE ${capacityAllows(ticket.performanceId, capacity, tickets.length, ticket.reservationId)}
  `)
}
