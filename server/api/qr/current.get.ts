import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'

// The booking the exchanged cookie names, read live (D-108 criteria 1, 4). The cookie is the
// only credential this route asks for; no account session is required.
export default defineEventHandler(async (event) => {
  const token = getCookie(event, QR_COOKIE_NAME)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Open the link from your confirmation email to see this booking' })

  const reservationId = await verifyQrToken(token)
  if (!reservationId) throw createError({ statusCode: 401, statusMessage: 'That link has expired. Open it again from your email' })

  const reservation = await reservationCurrentState(reservationId)
  if (!reservation) throw noSuch('booking', 'Check the reference and try again')

  // Rendered again rather than reusing the email's copy: the image carries the same stable
  // token either way (D-108 criteria 1, 3), and nothing here is cached across a request.
  const url = `${useRuntimeConfig(event).public.baseURL}/qr/${token}`
  // Guidance is for somebody still coming, from the rows the show page reads (D-102 criterion 4):
  // a cancelled, lapsed, exchanged or already admitted booking is told nothing.
  const coming = reservation.status === 'PENDING' || reservation.status === 'COLLECTED'
  const [ticketLines, guidance] = await Promise.all([
    namedTicketLines(reservationId),
    coming ? bookingGuidance(referenceShowScope(reservation.reference)) : null,
  ])

  return {
    reference: reservation.reference,
    status: reservation.status,
    cancelledBy: reservation.cancelledBy,
    show: reservation.showTitle,
    guidance,
    when: formatLondon(new Date(reservation.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    totalDue: reservation.status === 'PENDING' ? saysPrice(reservation.totalPence) : null,
    qrSvg: qrSvgBase64(url),
    lines: ticketLines,
    exchangedTo: reservation.exchangedToShowTitle && reservation.exchangedToStartsAt
      ? { showTitle: reservation.exchangedToShowTitle, when: formatLondon(new Date(reservation.exchangedToStartsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }) }
      : null,
  }
})
