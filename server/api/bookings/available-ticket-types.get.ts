import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { createReservation } from '~~/shared/utils/abilities'

/**
 * GET /api/bookings/available-ticket-types?performanceId=:id
 *
 * Returns all ticket types with their effective price and active status
 * for a given performance, resolved through the override chain:
 *   performance override → show override → base price
 *
 * Used by the walk-in modal to show override-aware ticket types
 * before a reservation exists.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, createReservation)

  const query = getQuery(event)
  const performanceId = query.performanceId as string | undefined

  if (!performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'performanceId query parameter is required' })
  }

  // Resolve showId from the performance
  const perf = await db
    .select({ showId: schema.performances.showId })
    .from(schema.performances)
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!perf) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  const showId = perf.showId

  // Load all base ticket types
  const allTypes = await db.select().from(schema.ticketTypes)
  const typeIds = allTypes.map(t => t.id)

  // Load show-level and performance-level overrides
  const [showOverrides, perfOverrides] = await Promise.all([
    typeIds.length > 0
      ? db.select().from(schema.showTicketTypeOverrides).where(
          and(
            eq(schema.showTicketTypeOverrides.showId, showId),
            inArray(schema.showTicketTypeOverrides.ticketTypeId, typeIds),
          ),
        )
      : Promise.resolve([]),
    typeIds.length > 0
      ? db.select().from(schema.performanceTicketTypeOverrides).where(
          and(
            eq(schema.performanceTicketTypeOverrides.performanceId, performanceId),
            inArray(schema.performanceTicketTypeOverrides.ticketTypeId, typeIds),
          ),
        )
      : Promise.resolve([]),
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
