import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { deleteTicketType } from '~~/shared/utils/abilities'

/** DELETE /api/ticket-types/:id. Delete a ticket type. Admin only. */
export default defineEventHandler(async (event) => {
  const ticketTypeId = getRouterParam(event, 'id')

  if (!ticketTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Ticket type ID is required' })
  }

  await authorize(event, deleteTicketType)

  const existing = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticketTypeId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Ticket type not found' })
  }

  // Note: deletion will be blocked by the DB if any issued tickets reference this type (onDelete: 'restrict')
  try {
    await db.delete(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticketTypeId))
  }
  catch {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot delete this ticket type because it has issued tickets associated with it',
    })
  }

  return { message: 'Ticket type deleted successfully' }
})
