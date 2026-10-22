import { collectForm, uncollectableReason } from '#shared/utils/desk'
import { passCollectReason } from '#shared/utils/reservations'

// The payment boundary (criterion 2): the reader is paid from the figure this route refuses to
// let drift from what the server actually charges (criterion 3, D-104 criterion 1 for tickets).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, collectForm)

  const reservation = await deskReservation(id)
  if (!reservation) throw noSuch('booking', 'Check the reference and try again')

  const refusal = uncollectableReason(reservation.status)
    ?? passCollectReason(reservation.holdExpiresAt, reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0))
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  let compRequest = null
  if (input.tender === 'COMP') {
    // Desk access is not comp authority (D-117 criterion 1): only an approved request, decided
    // by tonight's duty manager or a ticketing manager, ever moves a comp to collection.
    const request = await ticketCompRequestById(input.compRequestId!, expiryMinutes)
    if (!request || request.reservationId !== id) throw noSuch('comp request')
    if (request.status !== 'APPROVED') {
      throw createError({ statusCode: 409, statusMessage: request.status === 'PENDING' ? 'That request has not been approved yet' : 'That request was declined' })
    }
    if (request.expired) throw createError({ statusCode: 409, statusMessage: 'That request has lapsed; ask again' })
    if (request.entryId) throw createError({ statusCode: 409, statusMessage: 'That comp has already been given' })
    compRequest = request
  }

  const ticketTotalPence = reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0)
  const dueNow = amountDueFor(input.tender, ticketTotalPence)
  if (dueNow !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysPrice(input.expectedTotalPence)}; the desk now reads ${saysPrice(dueNow)}. Nothing has been charged: check the booking and try again.`,
    })
  }

  const result = await collect({ ...input, reservationId: id }, resolved.account.id, reservation.tickets, reservation.performanceId, compRequest, expiryMinutes)

  // The booker hears it is paid, as a walk-up's does; the collection has committed, so a failed
  // send never uncollects it (0003).
  const bookerId = await reservationBookerId(id)
  if (bookerId) {
    try {
      await sendWalkUpPaid(event, {
        userId: bookerId,
        reference: reservation.reference,
        showTitle: reservation.showTitle,
        startsAt: reservation.startsAt,
        paidPence: dueNow,
        qrToken: await qrTokenFor(id),
        paidAt: 'DESK',
        comp: input.tender === 'COMP',
      })
    }
    catch (error) {
      console.error('[desk] booking collected but the paid confirmation could not be sent', error)
    }
  }

  return { ok: true, ...result }
})
