import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { updateReservation } from '~~/shared/utils/abilities'

/**
 * GET /api/reservations/:id/available-ticket-types — types active for this
 * reservation's performance, with effective prices.
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

  // Only types a human may sell: archived legacy types and the pass
  // bookkeeping kinds are excluded. See sellableTicketTypes().
  const allTypes = await db.select().from(schema.ticketTypes).where(sellableTicketTypes())
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

  const ctx = { baseTypes: allTypes, showOverrides, perfOverrides }
  return allTypes
    .map((type) => {
      const { effectivePrice, active } = resolveEffectiveTicketType(type.id, ctx)
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        effectivePrice,
        active,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})
