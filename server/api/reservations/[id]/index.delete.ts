import { eq } from 'drizzle-orm'
import { reservations, tickets } from 'hub:db:schema'
import { deleteReservation } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, deleteReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const existing = await db.select().from(reservations).where(eq(reservations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  // Delete tickets first (onDelete: 'restrict' on the reservation FK prevents deleting parent first)
  await db.delete(tickets).where(eq(tickets.reservationId, id))
  await db.delete(reservations).where(eq(reservations.id, id))

  return { message: 'Reservation deleted successfully' }
})
