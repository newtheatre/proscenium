import { db } from '@nuxthub/db'

/** GET /api/ticket-types/:id — get a ticket type by ID. Public. */
export default defineEventHandler(async (event) => {
  const ticketTypeId = getRouterParam(event, 'id')

  if (!ticketTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Ticket type ID is required' })
  }

  // Ticket types are public — no authentication required

  const ticketType = await db.query.ticketTypes.findFirst({
    where: (ticketTypes, { eq }) => eq(ticketTypes.id, ticketTypeId),
  })

  if (!ticketType) {
    throw createError({ statusCode: 404, statusMessage: 'Ticket type not found' })
  }

  return ticketType
})
