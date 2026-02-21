import { shows, performances, ticketTypes, showTicketTypeOverrides, performanceTicketTypeOverrides } from 'hub:db:schema'
import { eq, and } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/performances/:performanceId/ticket-types
 *
 * Returns all ticket types with their effective price and active status for a specific
 * performance, reflecting the full override chain:
 *   performance override → show override → base ticket type default
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')

  if (!showId || !performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Performance ID are required' })
  }

  await authorize(event, readShow)

  const show = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const performance = await db.select().from(performances)
    .where(and(eq(performances.id, performanceId), eq(performances.showId, showId)))
    .get()
  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  const [allTypes, showOverrides, perfOverrides] = await Promise.all([
    db.select().from(ticketTypes).orderBy(ticketTypes.name).all(),
    db.select().from(showTicketTypeOverrides)
      .where(eq(showTicketTypeOverrides.showId, showId))
      .all(),
    db.select().from(performanceTicketTypeOverrides)
      .where(eq(performanceTicketTypeOverrides.performanceId, performanceId))
      .all(),
  ])

  const showOverrideMap = new Map(showOverrides.map(o => [o.ticketTypeId, o]))
  const perfOverrideMap = new Map(perfOverrides.map(o => [o.ticketTypeId, o]))

  return allTypes.map((tt) => {
    const showOverride = showOverrideMap.get(tt.id) ?? null
    const perfOverride = perfOverrideMap.get(tt.id) ?? null
    return {
      ...tt,
      showOverride,
      perfOverride,
      effectivePrice: perfOverride?.price ?? showOverride?.price ?? tt.price,
      effectiveActive: perfOverride?.active ?? showOverride?.active ?? tt.activeByDefault,
    }
  })
})
