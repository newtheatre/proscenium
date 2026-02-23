import { db } from '@nuxthub/db'

export default defineEventHandler(async () => {
  // Ticket types are public — needed for booking flows

  const allTicketTypes = await db.query.ticketTypes.findMany({
    orderBy: (ticketTypes, { asc }) => [asc(ticketTypes.name)],
  })

  return allTicketTypes
})
