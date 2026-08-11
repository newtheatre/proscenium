import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'

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
 * Validate that every ID in `ticketTypeIds` exists in `ctx.baseTypes`.
 * Throws a 400 error on the first missing type.
 */
export function validateTicketTypesExist(
  ticketTypeIds: string[],
  ctx: TicketPriceContext,
): void {
  const missingId = ticketTypeIds.find(id => !ctx.baseTypes.find(t => t.id === id))
  if (missingId) {
    throw createError({ statusCode: 400, statusMessage: `Ticket type ${missingId} not found` })
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
 * Assert that `additional` more tickets can be sold for a performance without
 * exceeding its capacity, counting active (non-refunded) tickets on
 * PENDING/COLLECTED/DOOR reservations.
 *
 * Capacity is `performances.capacityOverride ?? venues.capacity`; a null
 * capacity means uncapped. Raising `capacityOverride` is the deliberate way for
 * staff to oversell, rather than bypassing this check.
 *
 * Throws 404 if the performance is unknown, 409 if the request would oversell.
 * Note: this is a read-then-write check with no lock, so two concurrent writes
 * can still both pass — accepted at this booking volume.
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

  const [existing] = await db
    .select({ count: count() })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .where(
      and(
        eq(schema.tickets.performanceId, performanceId),
        inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
        isNull(schema.tickets.refundedAt),
      ),
    )

  const currentCount = existing?.count ?? 0
  if (currentCount + additional > capacity) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Not enough tickets available for this performance',
    })
  }
}
