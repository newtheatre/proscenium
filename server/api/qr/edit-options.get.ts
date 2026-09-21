// What the edit form needs while a booking is still unpaid: what may be added, and what is
// already held, priced and named for the booker who actually holds the reservation (D-110).
export default defineEventHandler(async (event) => {
  const reservationId = await requireQrReservationId(event)

  const reservation = await selfServiceReservation(reservationId)
  if (!reservation || reservation.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be changed here' })
  }

  const isMember = reservation.userId ? await hasCurrentMembership(event, reservation.userId, new Date()) : false

  const [ticketTypes, lines] = await Promise.all([
    bookableTicketTypes(reservation.performanceId, reservation.showId, isMember),
    namedTicketLines(reservationId),
  ])

  // The same cap the write path applies, so the form never offers a quantity it would refuse
  // (D-104 criterion 2, D-110 criterion 6).
  return { ticketTypes, lines, cap: await configValue(event, 'PUBLIC_ORDER_SEAT_CAP') }
})
