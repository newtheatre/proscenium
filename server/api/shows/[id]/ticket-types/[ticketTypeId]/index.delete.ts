import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { updateShow } from '~~/shared/utils/abilities'

/**
 * DELETE /api/shows/:id/ticket-types/:ticketTypeId
 *
 * Removes a show-level ticket type override, reverting that ticket type
 * to its base defaults for this show.
 */
/** DELETE /api/shows/:id/ticket-types/:ticketTypeId — remove a show ticket type override. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const ticketTypeId = getRouterParam(event, 'ticketTypeId')

  if (!showId || !ticketTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Ticket Type ID are required' })
  }

  await authorize(event, updateShow)

  const show = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const existing = await db.select().from(schema.showTicketTypeOverrides)
    .where(and(
      eq(schema.showTicketTypeOverrides.showId, showId),
      eq(schema.showTicketTypeOverrides.ticketTypeId, ticketTypeId),
    ))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'No override exists for this ticket type' })
  }

  await db.delete(schema.showTicketTypeOverrides).where(eq(schema.showTicketTypeOverrides.id, existing.id))

  return { message: 'Show ticket type override removed' }
})
