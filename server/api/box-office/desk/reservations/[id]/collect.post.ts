import { collectForm, uncollectableReason } from '#shared/utils/desk'

// The payment boundary (criterion 2): the reader is paid from the figure this route refuses to
// let drift from what the server actually charges (criterion 3, D-104 criterion 1 for tickets).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, collectForm)

  // Desk access is not comp authority: an ordinary volunteer collects, but only a manager
  // self-approves one, until D-117's own request-and-approval flow replaces this gate.
  if (input.tender === 'COMP' && !resolved.permissions.has('ticketing.manage')) {
    throw createError({ statusCode: 403, statusMessage: 'A manager must approve a comp' })
  }

  const reservation = await deskReservation(id)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const refusal = uncollectableReason(reservation.status)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const ticketTotalPence = reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0)
  const dueNow = amountDueFor(input.tender, ticketTotalPence)
  if (dueNow !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysPrice(input.expectedTotalPence)}; the desk now reads ${saysPrice(dueNow)}. Nothing has been charged: check the booking and try again.`,
    })
  }

  const result = await collect({ ...input, reservationId: id }, resolved.account.id, reservation.tickets)

  return { ok: true, ...result }
})
