import { exchangeTotalPence, showingBookingQuery } from '#shared/utils/reservations'

// What the exchange form needs: the other performances of the same show, the same honest
// availability the public listing shows (D-111, D-101), each with what this booking would cost there.
export default defineEventHandler(async (event) => {
  const reservationId = await requireQrReservationId(event)
  const { reference } = await getValidatedQueryOrThrow(event, showingBookingQuery)

  const reservation = await shownSelfServiceReservation(reservationId, reference)
  if (!reservation || reservation.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be exchanged here' })
  }

  const show = await publicShowBySlug(await listingRules(event), reservation.showSlug)
  if (!show) throw noSuch('show')

  const others = show.performances.filter(one => one.id !== reservation.performanceId && !one.cancelled && !one.externalBookingUrl)
  const isMember = reservation.userId ? await hasCurrentMembership(event, reservation.userId, new Date()) : false
  const [lines, named] = await Promise.all([exchangeableTicketLines(reservationId), namedTicketLines(reservationId)])

  // Priced the way the exchange itself prices them, so the total shown before confirming is the
  // total the exchange writes (D-111 criterion 2). One read per night of one show's run.
  const performances = await Promise.all(others.map(async (one) => {
    const offered = await bookableTicketTypes(one.id, reservation.showId, isMember, false)
    return { ...one, totalPence: exchangeTotalPence(lines, offered) }
  }))

  return {
    currentPerformanceId: reservation.performanceId,
    currentTotalPence: named.reduce((total, line) => total + Number(line.totalPence), 0),
    performances,
  }
})
