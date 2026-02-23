import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { updateReservation } from '~~/shared/utils/abilities'

/**
 * GET /api/reservations/:id/available-ticket-types
 *
 * Returns all ticket types that are active for this reservation's performance,
 * with their effective price resolved through the override chain:
 *   performance override → show override → base price
 *
 * Used by the ticket management UI to know which types can be added
 * and what they would cost at the current moment.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, updateReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const reservation = await db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .get()

  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  const performanceId = reservation.performanceId

  // Resolve showId from the performance
  const perf = await db
    .select({ showId: schema.performances.showId })
    .from(schema.performances)
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!perf) throw createError({ statusCode: 500, statusMessage: 'Performance not found' })
  const showId = perf.showId

  // Load all base ticket types
  const allTypes = await db.select().from(schema.ticketTypes)
  const typeIds = allTypes.map(t => t.id)

  // Load show-level and performance-level overrides for these types
  const [showOverrides, perfOverrides] = await Promise.all([
    db.select().from(schema.showTicketTypeOverrides).where(
      and(
        eq(schema.showTicketTypeOverrides.showId, showId),
        inArray(schema.showTicketTypeOverrides.ticketTypeId, typeIds),
      ),
    ),
    db.select().from(schema.performanceTicketTypeOverrides).where(
      and(
        eq(schema.performanceTicketTypeOverrides.performanceId, performanceId),
        inArray(schema.performanceTicketTypeOverrides.ticketTypeId, typeIds),
      ),
    ),
  ])

  return allTypes
    .map((type) => {
      const perfOverride = perfOverrides.find(o => o.ticketTypeId === type.id)
      const showOverride = showOverrides.find(o => o.ticketTypeId === type.id)

      // Resolve active — false wins if any level sets it false
      const baseActive = type.activeByDefault
      const showActive = showOverride?.active ?? baseActive
      const active = perfOverride?.active ?? showActive

      // Resolve effective price
      const effectivePrice = perfOverride?.price ?? showOverride?.price ?? type.price

      return {
        id: type.id,
        name: type.name,
        description: type.description,
        effectivePrice,
        active,
      }
    })
    .filter(t => t.active)
    .sort((a, b) => a.name.localeCompare(b.name))
})
