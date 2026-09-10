import { ticketCompRequestForm } from '#shared/utils/ticket-comps'

// Ask for a comp: open to any ticketing-authorised desk user, since nothing moves until it is
// approved (D-117 criterion 1). Names an existing, still-collectible booking, never a basket.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, ticketCompRequestForm)

  const reservation = await deskReservation(input.reservationId)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })
  const refusal = uncollectableReason(reservation.status)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const id = await createTicketCompRequest(resolved.account.id, input.reservationId, reservation.performanceId, input.reason)

  return { ok: true, id }
})
