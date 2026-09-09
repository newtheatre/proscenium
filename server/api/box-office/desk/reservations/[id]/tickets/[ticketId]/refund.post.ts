import { refundTicketForm } from '#shared/utils/desk'
import { saysPrice } from '#shared/utils/ticket-types'

// Money handed back in person, one ticket at a time (D-116 criterion 1). The reader is paid from
// the figure this route refuses to let drift from what the ticket actually cost (criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''
  const ticketId = getRouterParam(event, 'ticketId') ?? ''
  const input = await readValidatedBodyOrThrow(event, refundTicketForm)

  const reservation = await deskReservation(id)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  if (reservation.status !== 'COLLECTED') {
    throw createError({ statusCode: 409, statusMessage: 'This booking has nothing paid to refund from here' })
  }

  const ticket = reservation.tickets.find(one => one.ticketId === ticketId)
  if (!ticket) throw createError({ statusCode: 404, statusMessage: 'No such ticket on this booking, or it is already refunded' })

  if (ticket.pricePaid !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysPrice(input.expectedTotalPence)}; the ticket reads ${saysPrice(ticket.pricePaid)}. Nothing has been refunded: check the ticket and try again.`,
    })
  }

  // Criterion 2: a standing money.refund holder approves themselves; anyone else needs tonight's
  // confirmed duty manager for this performance, scoped so a shift elsewhere does not reach it.
  const approverId = await requireRefundApproval(event, resolved, { performanceId: reservation.performanceId })

  const result = await refundTicket({ reservationId: id, ticketId, pricePaid: ticket.pricePaid, actorId: approverId })
  if (!result.applied) {
    throw createError({ statusCode: 409, statusMessage: 'This ticket has already been refunded' })
  }

  return { ok: true, entryId: result.entryId }
})
