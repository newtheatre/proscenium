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
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  // Rendered again rather than reusing the email's copy: the image carries the same stable
  // token either way (D-108 criteria 1, 3), and nothing here is cached across a request.
  const url = `${useRuntimeConfig(event).public.baseURL}/qr/${token}`

  return {
    reference: reservation.reference,
    status: reservation.status,
    cancelledBy: reservation.cancelledBy,
    show: reservation.showTitle,
    when: formatLondon(new Date(reservation.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    totalDue: reservation.status === 'PENDING' ? saysPrice(reservation.totalPence) : null,
    qrSvg: qrSvgBase64(url),
  }
})
