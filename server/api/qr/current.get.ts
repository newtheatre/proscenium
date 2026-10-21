import { formatLondon } from '#shared/utils/london'
import { saysTotalDue } from '#shared/utils/reservations'
import { saysClock, saysWhenLong } from '#shared/utils/when'

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
  const [ticketLines, shown] = await Promise.all([
    namedTicketLines(reservationId),
    bookingGuidance(referenceShowScope(reservation.reference)),
  ])
  const guidance = coming ? shown : null

  return {
    reference: reservation.reference,
    status: reservation.status,
    cancelledBy: reservation.cancelledBy,
    show: reservation.showTitle,
    guidance,
    // The page offers no change, exchange or cancel on a pass booking (issue 1390).
    passBooking: reservation.passBooking === 1,
    when: formatLondon(new Date(reservation.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    totalDue: saysTotalDue(reservation.status, reservation.holdExpiresAt, reservation.totalPence),
    qrSvg: qrSvgBase64(url),
    lines: ticketLines,
    // Where to go, when the doors open and when an unpaid hold is let go, as the booking form
    // said them (D-106 criterion 1, 0122).
    venue: { name: reservation.venueName, address: reservation.venueAddress },
    doors: reservation.doorsAt ? saysClock(reservation.doorsAt) : null,
    releasesAt: coming && reservation.holdExpiresAt ? saysWhenLong(reservation.holdExpiresAt) : null,
    // A booking that ended without a replacement points back at the show, never a dead end (0122).
    bookAgainUrl: ['CANCELLED', 'EXPIRED'].includes(reservation.status) && !reservation.exchangedToReference && shown?.slug ? `/shows/${shown.slug}` : null,
    exchangedTo: reservation.exchangedToShowTitle && reservation.exchangedToStartsAt
      ? {
          showTitle: reservation.exchangedToShowTitle,
          when: formatLondon(new Date(reservation.exchangedToStartsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
          reference: reservation.exchangedToReference ?? undefined,
        }
      : null,
  }
})
