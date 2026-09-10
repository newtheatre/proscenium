import { exchangeReservation } from '#server/utils/exchange'
import { saleRefusal } from '#shared/utils/programme'
import {
  bornExpiredReason,
  differentShowReason,
  holdExpiresAt,
  reservationExchangeForm,
  resolveHoldReleaseMinutes,
  sameNightReason,
} from '#shared/utils/reservations'

// Move an unpaid reservation to another performance of the same show (D-111). No money moves
// here either: the exchange only ever touches an unpaid hold (0005).
export default defineEventHandler(async (event) => {
  const reservationId = await requireQrReservationId(event)
  const input = await readValidatedBodyOrThrow(event, reservationExchangeForm)

  const reservation = await selfServiceReservation(reservationId)
  if (!reservation || reservation.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be exchanged here' })
  }

  const sameNight = sameNightReason(reservation.performanceId, input.performanceId)
  if (sameNight) throw createError({ statusCode: 400, statusMessage: sameNight })

  const target = await performanceById(input.performanceId)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  // Criterion 5: a different show is cancel and rebook, not an exchange.
  const differentShow = differentShowReason(reservation.showId, target.showId)
  if (differentShow) throw createError({ statusCode: 400, statusMessage: differentShow })

  const refusal = saleRefusal(target, new Date(), 'CUSTOMER')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

  const lines = await exchangeableTicketLines(reservationId)
  // Entitlement is checked once, against the performance it was granted for (D-128 criterion 2);
  // carrying it through an exchange is a box office conversation, not this form's job.
  if (lines.some(line => line.accessKind !== null)) {
    throw createError({ statusCode: 409, statusMessage: 'A booking with an access or companion ticket cannot be exchanged online. Contact the box office directly.' })
  }

  const isMember = reservation.userId ? await hasCurrentMembership(event, reservation.userId, new Date()) : false
  const resolved = new Map((await bookableTicketTypes(target.id, target.showId, isMember, false)).map(type => [type.id, type]))

  const toWrite = lines.map((line) => {
    const type = resolved.get(line.ticketTypeId)
    if (!type) throw createError({ statusCode: 409, statusMessage: 'This performance does not offer one of the ticket types on this booking. Contact the box office directly.' })
    return { ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source }
  })

  const releaseMinutes = resolveHoldReleaseMinutes(target.holdReleaseMinutesBefore, await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE'))
  const expiresAt = holdExpiresAt(target.startsAt, releaseMinutes)
  const bornExpired = bornExpiredReason(expiresAt, Math.floor(Date.now() / 1000))
  if (bornExpired) throw createError({ statusCode: 409, statusMessage: bornExpired })

  const result = await exchangeReservation({
    reservationId,
    userId: reservation.userId,
    targetPerformanceId: target.id,
    lines: toWrite,
    capacity: effectiveCapacity(target),
    holdExpiresAt: expiresAt,
  })

  if (!result.applied || !result.reservation) {
    throw createError({ statusCode: 409, statusMessage: 'That performance no longer has room for this booking. Contact the box office directly.' })
  }

  const qrToken = await qrTokenFor(result.reservation.id)
  const totalPence = result.reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0)

  // The old token still verifies, but names a row that now reads Exchanged: this page's own
  // cookie has to move to the new booking, or the booker would be looking at the old one.
  setCookie(event, QR_COOKIE_NAME, qrToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: QR_COOKIE_MAX_AGE_SECONDS,
  })

  // The batch committed, so the exchange is real: send after, never before (0003). The new QR
  // is the e-ticket re-issue criterion 4 asks for; the old one now reads Exchanged when presented.
  if (reservation.userId) {
    await sendReservationConfirmation(event, {
      userId: reservation.userId,
      reference: result.reservation.reference,
      showTitle: target.showTitle,
      startsAt: target.startsAt,
      totalPence,
      qrToken,
    })
  }

  // Frees the seats this booking held (D-113 criterion 2): offered on exactly as a plain
  // self-cancel does, since that is what the source side of an exchange also is.
  const cap = await configValue(event, 'WAITING_LIST_OFFER_BATCH_CAP')
  const offered = await offerWaitingList(event, reservation.performanceId, new Date(), cap)
  await notifyWaitingListOffers(event, offered.offered)

  return {
    reference: result.reservation.reference,
    status: 'PENDING' as const,
    performanceId: target.id,
    tickets: result.reservation.tickets,
    totalPence,
    qrToken,
  }
})
