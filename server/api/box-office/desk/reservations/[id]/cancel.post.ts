import { strandedMoneyReason } from '#shared/utils/desk'

// D-116 criterion 6: refund first, then cancel. An unpaid booking cancels itself from its own
// confirmation (D-110); this is the desk's own action once a collected booking owes nothing.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''

  const reservation = await deskReservation(id)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  if (reservation.status !== 'COLLECTED') {
    throw createError({ statusCode: 409, statusMessage: 'Only a collected booking is cancelled from here' })
  }

  // `deskReservation` already lists unrefunded tickets only, so what remains is exactly what
  // is still owed back.
  const strandedPence = reservation.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0)
  const refusal = strandedMoneyReason(strandedPence)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const applied = await cancelCollectedReservation(id, resolved.account.id)
  if (!applied) throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be cancelled here' })

  return { status: 'CANCELLED' as const }
})
