import { normaliseEmail } from '#shared/utils/auth'
import { reservationResendForm } from '#shared/utils/reservations'

const SAME_ANSWER = { ok: true, message: 'If that reference and address match a booking, its confirmation is on its way' }

// Resend a booking's confirmation, with its original QR (D-108 criterion 2). Answers
// identically whether or not the reference exists, so a guess reveals nothing.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, reservationResendForm)
  const reference = input.reference.toUpperCase()
  const email = normaliseEmail(input.email)

  await enforce(event, {
    scope: 'reservation:resend:ip',
    value: clientIp(event),
    limit: await configValue(event, 'RESERVATION_RESEND_ATTEMPTS'),
    windowMinutes: await configValue(event, 'RESERVATION_RESEND_WINDOW_MINUTES'),
  })
  await enforce(event, {
    scope: 'reservation:resend:reference',
    value: reference,
    limit: await configValue(event, 'RESERVATION_RESEND_ATTEMPTS'),
    windowMinutes: await configValue(event, 'RESERVATION_RESEND_WINDOW_MINUTES'),
  })

  const reservation = await reservationForResend(reference)
  // Resent only while still unpaid: the template says UNPAID and quotes an amount due, which
  // would be wrong once the booking has moved on (paid, cancelled or lapsed).
  if (reservation?.status === 'PENDING' && reservation.userId) {
    const account = await findById(reservation.userId)
    if (account && normaliseEmail(account.email) === email) {
      await sendReservationConfirmation(event, {
        userId: reservation.userId,
        reference: reservation.reference,
        showTitle: reservation.showTitle,
        startsAt: reservation.startsAt,
        totalPence: reservation.totalPence,
        qrToken: await qrTokenFor(reservation.id),
      })
    }
  }

  return SAME_ANSWER
})
