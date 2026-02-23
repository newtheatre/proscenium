import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { updatePerformance } from '~~/shared/utils/abilities'

/**
 * DELETE /api/shows/:id/performances/:performanceId/ticket-types/:ticketTypeId
 *
 * Removes a performance-level ticket type override, reverting to show/base defaults.
 */
/** DELETE /api/shows/:id/performances/:performanceId/ticket-types/:ticketTypeId — remove a performance ticket type override. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')

  if (!showId || !performanceId || !ticketTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID, Performance ID and Ticket Type ID are required' })
  }

  await authorize(event, updatePerformance)

  const show = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const performance = await db.select().from(schema.performances)
    .where(and(eq(schema.performances.id, performanceId), eq(schema.performances.showId, showId)))
    .get()
  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  await db.delete(schema.performanceTicketTypeOverrides)
    .where(and(
      eq(schema.performanceTicketTypeOverrides.performanceId, performanceId),
      eq(schema.performanceTicketTypeOverrides.ticketTypeId, ticketTypeId),
    ))
    .run()

  return { message: 'Performance ticket type override removed' }
})
