import { pastCurtainReason } from '#shared/utils/reservations'

// Self-cancel while unpaid and before curtain-up (D-110 criterion 3). Frees capacity the instant
// the status leaves the holding set; nothing here refunds, since nothing has been paid yet.
export default defineEventHandler(async (event) => {
  const reservationId = await requireQrReservationId(event)

  const reservation = await selfServiceReservation(reservationId)
  if (!reservation || reservation.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be cancelled here' })
  }

  const curtainReason = pastCurtainReason(reservation.startsAt, Math.floor(Date.now() / 1000))
  if (curtainReason) throw createError({ statusCode: 409, statusMessage: curtainReason })

  const applied = await cancelReservation(reservationId, reservation.userId)
  if (!applied) throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be cancelled here' })

  if (reservation.userId) {
    await sendReservationCancellation(event, { userId: reservation.userId, reservationId })
  }

  // Frees a seat the same way expiry does (D-113 criterion 2), so the waiting list is offered here too.
  const cap = await configValue(event, 'WAITING_LIST_OFFER_BATCH_CAP')
  const run = await offerWaitingList(event, reservation.performanceId, new Date(), cap)
  await notifyWaitingListOffers(event, run.offered)

  return { status: 'CANCELLED' as const }
})
