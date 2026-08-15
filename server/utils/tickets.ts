import { db, schema } from '@nuxthub/db'
import type { SQL } from 'drizzle-orm'
import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm'

/**
 * Types a human may sell: SINGLE, not archived. PASS_SALE and PASS_ADMISSION
 * are bookkeeping and must never reach a picker (ADR-0002, ADR-0010).
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
 * Base rows plus show- and performance-level overrides for a set of type ids.
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
 * Effective price through the override chain: performance → show → base.
 * 400 if the type is not in the base rows.
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
 * Existence plus sellability, checked here rather than at the call sites so a
 * new write path inherits both. Pass redemption deliberately bypasses it.
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
 * Hiding these in the pickers is not enough: write paths take type ids from
 * the request body, so a stale tab can still name one.
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
 * Effective active state through the override chain: performance → show →
 * base `activeByDefault`. 400 if the type is not in the base rows.
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
 * Price and active state together — the single source of the resolution rule.
 * Endpoints use this rather than re-implementing either half.
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
 * Guards the public booking path: inactive types are hidden in the UI but
 * still reachable by id, so the write path must reject them.
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
 * The single definition of "this ticket occupies a seat" (ADR-0007) — do not
 * add a parallel path. Pass a subquery, never an id list (ADR-0006).
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
 * One reservation's seats, ignoring its status — for reinstatement, where the
 * tickets are about to start counting against the house again.
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
 * Cancelling releases seats to be resold, so moving a reservation back out of
 * one of these statuses must be capacity-checked (ADR-0007).
 */
export const SEAT_RELEASING_STATUSES = ['CANCELLED', 'NO_SHOW'] as const

export function releasesSeats(status: string): boolean {
  return (SEAT_RELEASING_STATUSES as readonly string[]).includes(status)
}

/**
 * Capacity is `capacityOverride ?? venue.capacity`; null is uncapped. 409 if
 * it would oversell. Read-then-write with no lock (ADR-0007).
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
