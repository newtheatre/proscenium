import { db } from '@nuxthub/db'
import { readReservation } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const reservation = await db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, id),
    with: reservationDetailWith,
  })

  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }

  await authorize(event, readReservation, { userId: reservation.userId })

  return reservation
})
