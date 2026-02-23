import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'

/**
 * Loaded override data used by `resolveEffectivePrice`.
 */
export interface TicketPriceContext {
  baseTypes: Array<{ id: string, price: number, [key: string]: unknown }>
  showOverrides: Array<{ ticketTypeId: string, price: number | null, [key: string]: unknown }>
  perfOverrides: Array<{ ticketTypeId: string, price: number | null, [key: string]: unknown }>
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
