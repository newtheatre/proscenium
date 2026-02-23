import { db } from '@nuxthub/db'

/** GET /api/ticket-types — list all ticket types. Public. */
export default defineEventHandler(async () => {
  // Ticket types are public — needed for booking flows

  const allTicketTypes = await db.query.ticketTypes.findMany({
    orderBy: (ticketTypes, { asc }) => [asc(ticketTypes.name)],
  })

  return allTicketTypes
})
