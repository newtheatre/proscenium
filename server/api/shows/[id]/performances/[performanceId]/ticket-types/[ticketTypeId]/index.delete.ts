import { shows, performances, performanceTicketTypeOverrides } from 'hub:db:schema'
import { eq, and } from 'drizzle-orm'
import { updatePerformance } from '~~/shared/utils/abilities'

/**
 * DELETE /api/shows/:id/performances/:performanceId/ticket-types/:ticketTypeId
 *
 * Removes a performance-level ticket type override, reverting to show/base defaults.
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')

  if (!showId || !performanceId || !ticketTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID, Performance ID and Ticket Type ID are required' })
  }

  await authorize(event, updatePerformance)

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

  await db.delete(performanceTicketTypeOverrides)
    .where(and(
      eq(performanceTicketTypeOverrides.performanceId, performanceId),
      eq(performanceTicketTypeOverrides.ticketTypeId, ticketTypeId),
    ))
    .run()

  return { ok: true }
})
