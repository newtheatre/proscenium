import { claimWaitingListOfferForm } from '#shared/utils/waiting-list'

// The offer converts to an ordinary reservation, through D-104's own write path (D-113 criterion
// 2). No money moves here either: payment is still in person, on the night (0005).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const entryId = await verifyWaitingListToken(token)
  if (!entryId) throw createError({ statusCode: 404, statusMessage: 'No such waiting-list entry' })

  const entry = await waitingListEntryById(entryId)
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'No such waiting-list entry' })

  const input = await readValidatedBodyOrThrow(event, claimWaitingListOfferForm)
  const result = await claimWaitingListOffer(event, entry, input)
  if (!result.applied || !result.reservation) {
    throw createError({ statusCode: 409, statusMessage: result.refusal ?? 'This offer could no longer be claimed' })
  }

  const qrToken = await qrTokenFor(result.reservation.id)

  // The batch committed, so the booking is real: send after, never before (0003).
  await sendReservationConfirmation(event, {
    userId: entry.userId,
    reference: result.reservation.reference,
    showTitle: entry.showTitle,
    startsAt: entry.startsAt,
    totalPence: result.reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0),
    qrToken,
  })

  return {
    reference: result.reservation.reference,
    status: 'PENDING' as const,
    performanceId: entry.performanceId,
    tickets: result.reservation.tickets,
    totalPence: result.reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0),
    qrToken,
  }
})
