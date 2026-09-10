// What the exchange form needs: the other performances of the same show, the same honest
// availability the public listing shows (D-111, D-101).
export default defineEventHandler(async (event) => {
  const reservationId = await requireQrReservationId(event)

  const reservation = await selfServiceReservation(reservationId)
  if (!reservation || reservation.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be exchanged here' })
  }

  const limited = await configValue(event, 'LISTING_LIMITED_THRESHOLD_PERCENT')
  const show = await publicShowBySlug(limited, reservation.showSlug)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  return {
    currentPerformanceId: reservation.performanceId,
    performances: show.performances.filter(one => one.id !== reservation.performanceId && !one.cancelled && !one.externalBookingUrl),
  }
})
