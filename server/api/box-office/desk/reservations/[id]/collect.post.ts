import { collectForm, uncollectableReason } from '#shared/utils/desk'

// The payment boundary (criterion 2): the reader is paid from the figure this route refuses to
// let drift from what the server actually charges (criterion 3, D-104 criterion 1 for tickets).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, collectForm)

  const reservation = await deskReservation(id)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const refusal = uncollectableReason(reservation.status)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  let compRequest = null
  if (input.tender === 'COMP') {
    // Desk access is not comp authority (D-117 criterion 1): only an approved request, decided
    // by tonight's duty manager or a ticketing manager, ever moves a comp to collection.
    const request = await ticketCompRequestById(input.compRequestId!, expiryMinutes)
    if (!request || request.reservationId !== id) throw createError({ statusCode: 404, statusMessage: 'No such comp request' })
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

  return { ok: true, ...result }
})
