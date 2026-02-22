import { readReservation } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const reservation = await db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, id),
    with: {
      user: { columns: { id: true, name: true, email: true, password: false, verified: true } },
      performance: {
        with: {
          show: { columns: { id: true, title: true, slug: true } },
          venue: { columns: { id: true, name: true } },
        },
      },
      tickets: {
        with: {
          ticketType: { columns: { id: true, name: true, description: true } },
        },
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      },
    },
  })

  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }

  await authorize(event, readReservation, { userId: reservation.userId })

  return reservation
})
