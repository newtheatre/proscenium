import { db, schema } from '@nuxthub/db'
import type { SQL } from 'drizzle-orm'
import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm'

/**
 * Ticket types a human may choose to sell: `SINGLE`, not archived.
 *
 * `PASS_SALE` and `PASS_ADMISSION` are bookkeeping and must never reach a
 * picker or a stepper — deleting a PASS_ADMISSION ticket cascades to the
 * redemption ledger row and makes a used pass redeemable again (ADR-0002).
 * Archived types stay valid for historic tickets (ADR-0010).
 */
export function sellableTicketTypes() {
  return and(
    eq(schema.ticketTypes.kind, 'SINGLE'),
    eq(schema.ticketTypes.archived, false),
  )
}

/**
 * Loaded override data used by `resolveEffectivePrice`.
 */
export interface TicketPriceContext {
  baseTypes: Array<{ id: string, price: number, activeByDefault: boolean, [key: string]: unknown }>
  showOverrides: Array<{ ticketTypeId: string, price: number | null, active: boolean | null, [key: string]: unknown }>
  perfOverrides: Array<{ ticketTypeId: string, price: number | null, active: boolean | null, [key: string]: unknown }>
}

/**
 * Load the ticket-type base rows plus show- and performance-level overrides
 * for a set of ticket type IDs.
 *
 * @param ticketTypeIds  IDs of the ticket types to resolve
 * @param showId         Show context (for show-level overrides)
 * @param performanceId  Performance context (for performance-level overrides)
 */
export async function loadTicketPriceContext(
  ticketTypeIds: string[],
  showId: string,
  performanceId: string,
): Promise<TicketPriceContext> {
  const [baseTypes, showOverrides, perfOverrides] = await Promise.all([
    db.select().from(schema.ticketTypes).where(inArray(schema.ticketTypes.id, ticketTypeIds)),
    db.select().from(schema.showTicketTypeOverrides).where(
      and(
        eq(schema.showTicketTypeOverrides.showId, showId),
        inArray(schema.showTicketTypeOverrides.ticketTypeId, ticketTypeIds),
      ),
    ),
    db.select().from(schema.performanceTicketTypeOverrides).where(
      and(
        eq(schema.performanceTicketTypeOverrides.performanceId, performanceId),
        inArray(schema.performanceTicketTypeOverrides.ticketTypeId, ticketTypeIds),
      ),
    ),
  ])

  return { baseTypes, showOverrides, perfOverrides }
}

/**
 * Resolve the effective price for a ticket type through the override chain:
 *   performance override → show override → base price.
 *
 * Throws a 400 error if the ticket type is not found in the base types.
 */
export function resolveEffectivePrice(
  ticketTypeId: string,
  ctx: TicketPriceContext,
): number {
  const perfOverride = ctx.perfOverrides.find(o => o.ticketTypeId === ticketTypeId)
  if (perfOverride?.price != null) return perfOverride.price

  const showOverride = ctx.showOverrides.find(o => o.ticketTypeId === ticketTypeId)
  if (showOverride?.price != null) return showOverride.price

  const base = ctx.baseTypes.find(t => t.id === ticketTypeId)
  if (!base) {
    throw createError({ statusCode: 400, statusMessage: `Ticket type ${ticketTypeId} not found` })
  }
  return base.price
}

/**
 * Validate that every ID in `ticketTypeIds` exists in `ctx.baseTypes` and is one
 * a human may sell. Throws a 400 on the first bad type.
 *
 * The sellability check lives here, not at the call sites, so a new ticket
 * write path inherits it. Pass redemption creates its `PASS_ADMISSION` row
 * directly and deliberately does not come through here.
 */
export function validateTicketTypesExist(
  ticketTypeIds: string[],
  ctx: TicketPriceContext,
): void {
  const missingId = ticketTypeIds.find(id => !ctx.baseTypes.find(t => t.id === id))
  if (missingId) {
    throw createError({ statusCode: 400, statusMessage: `Ticket type ${missingId} not found` })
  }
  validateTicketTypesSellable(ticketTypeIds, ctx)
}

/**
 * Reject any requested type a human is not allowed to sell.
 *
 * Hiding these in the pickers is not enough: write paths take type ids from
 * the request body, so a stale tab or a hand-made call can still name one.
 */
export function validateTicketTypesSellable(
  ticketTypeIds: string[],
  ctx: TicketPriceContext,
): void {
  for (const id of ticketTypeIds) {
    const base = ctx.baseTypes.find(t => t.id === id) as
      { kind?: string, archived?: boolean } | undefined
    if (!base) continue // existence is validateTicketTypesExist's job
    if (base.kind === 'PASS_ADMISSION') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pass admissions are added and removed by redeeming or cancelling the pass, not by changing ticket quantities.',
      })
    }
    if (base.kind === 'PASS_SALE') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Passes are sold from the Passes tab, not as a ticket type.',
      })
    }
    if (base.archived) {
      throw createError({
        statusCode: 400,
        statusMessage: 'That ticket type has been retired and can no longer be sold.',
      })
    }
  }
}

/**
 * Resolve whether a ticket type is active for this show/performance through the
 * override chain: performance override → show override → base `activeByDefault`.
 *
 * Throws a 400 error if the ticket type is not found in the base types.
 */
export function resolveEffectiveActive(
  ticketTypeId: string,
  ctx: TicketPriceContext,
): boolean {
  const perfOverride = ctx.perfOverrides.find(o => o.ticketTypeId === ticketTypeId)
  if (perfOverride?.active != null) return perfOverride.active

  const showOverride = ctx.showOverrides.find(o => o.ticketTypeId === ticketTypeId)
  if (showOverride?.active != null) return showOverride.active

  const base = ctx.baseTypes.find(t => t.id === ticketTypeId)
  if (!base) {
    throw createError({ statusCode: 400, statusMessage: `Ticket type ${ticketTypeId} not found` })
  }
  return base.activeByDefault
}

/**
 * Resolve both the effective price and active status for a ticket type through
 * the override chain (performance → show → base). The single source of truth for
 * the resolution rule; endpoints should use this rather than re-implementing it.
 */
export function resolveEffectiveTicketType(
  ticketTypeId: string,
  ctx: TicketPriceContext,
): { effectivePrice: number, active: boolean } {
  return {
    effectivePrice: resolveEffectivePrice(ticketTypeId, ctx),
    active: resolveEffectiveActive(ticketTypeId, ctx),
  }
}

/**
 * Validate that every requested ticket type is active for this show/performance.
 * Existence is checked first. Throws a 400 on the first inactive type.
 *
 * This guards the public booking path: inactive types are hidden in the UI but
 * still reachable by ID, so the write path must reject them rather than trust
 * the client to only send active ones.
 */
export function validateTicketTypesActive(
  ticketTypeIds: string[],
  ctx: TicketPriceContext,
): void {
  validateTicketTypesExist(ticketTypeIds, ctx)
  const inactiveId = ticketTypeIds.find(id => !resolveEffectiveActive(id, ctx))
  if (inactiveId) {
    throw createError({ statusCode: 400, statusMessage: `Ticket type ${inactiveId} is not available for this performance` })
  }
}

/**
 * The single definition of "this ticket occupies a seat" (ADR-0007). Every
 * seat count in the app comes through here — do not add a parallel path.
 *
 * A ticket occupies a seat when it is not refunded, sits on a
 * PENDING/COLLECTED/DOOR reservation, and is not a `PASS_SALE` (which records
 * the purchase of a pass; the seat is the separate PASS_ADMISSION ticket).
 *
 * `performanceScope` is a condition on `tickets.performanceId`. Pass a
 * subquery rather than an id list — D1 binds at most 100 parameters per
 * statement (ADR-0006).
 */
export async function countOccupiedSeats(performanceScope: SQL): Promise<Map<string, number>> {
  const rows = await db
    .select({ performanceId: schema.tickets.performanceId, n: count() })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
    .where(
      and(
        performanceScope,
        inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
        isNull(schema.tickets.refundedAt),
        ne(schema.ticketTypes.kind, 'PASS_SALE'),
      ),
    )
    .groupBy(schema.tickets.performanceId)

  return new Map(rows.map(r => [r.performanceId, r.n]))
}

/** Seats occupied at one performance. See {@link countOccupiedSeats}. */
export async function countOccupiedSeatsFor(performanceId: string): Promise<number> {
  const counts = await countOccupiedSeats(eq(schema.tickets.performanceId, performanceId))
  return counts.get(performanceId) ?? 0
}

/**
 * How many seats one reservation's tickets occupy, ignoring its status.
 *
 * Used when a reservation moves back into an active status: those tickets are
 * about to start counting against the house again, so they have to be capacity
 * -checked as if they were being booked now.
 */
export async function countReservationSeats(reservationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
    .where(and(
      eq(schema.tickets.reservationId, reservationId),
      isNull(schema.tickets.refundedAt),
      ne(schema.ticketTypes.kind, 'PASS_SALE'),
    ))
  return row?.n ?? 0
}

/**
 * Reservation statuses whose tickets no longer hold seats.
 *
 * `assertCapacity` counts only PENDING/COLLECTED/DOOR, so cancelling a booking
 * releases its seats to be resold — which means moving a reservation *back* out
 * of one of these statuses re-takes seats that may already be gone.
 */
export const SEAT_RELEASING_STATUSES = ['CANCELLED', 'NO_SHOW'] as const

export function releasesSeats(status: string): boolean {
  return (SEAT_RELEASING_STATUSES as readonly string[]).includes(status)
}

/**
 * Assert that `additional` more tickets can be sold for a performance without
 * exceeding its capacity, counting active (non-refunded) tickets on
 * PENDING/COLLECTED/DOOR reservations.
 *
 * Capacity is `performances.capacityOverride ?? venues.capacity`; null means
 * uncapped. Raising the override is the sanctioned way to oversell (ADR-0007).
 *
 * Throws 404 if the performance is unknown, 409 if the request would oversell.
 * Read-then-write with no lock, so two concurrent writes can both pass —
 * accepted at this volume (docs/09-known-issues.md).
 */
export async function assertCapacity(performanceId: string, additional: number): Promise<void> {
  if (additional <= 0) return

  const perf = await db
    .select({
      capacityOverride: schema.performances.capacityOverride,
      venueCapacity: schema.venues.capacity,
    })
    .from(schema.performances)
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!perf) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })

  const capacity = perf.capacityOverride ?? perf.venueCapacity
  if (capacity == null) return // uncapped

  const currentCount = await countOccupiedSeatsFor(performanceId)
  if (currentCount + additional > capacity) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Not enough tickets available for this performance',
    })
  }
}
