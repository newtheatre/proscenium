import { saleRefusal } from '#shared/utils/programme'
import { belowMinimumTicketsReason, overCapReason, reservationEditForm, ticketEditDelta } from '#shared/utils/reservations'

// Self-service edit while unpaid (D-110 criterion 1). The QR cookie is the only credential asked
// for: a guest booker has no session, and a signed-in booker's own cookie works identically.
export default defineEventHandler(async (event) => {
  const reservationId = await requireQrReservationId(event)
  const input = await readValidatedBodyOrThrow(event, reservationEditForm)

  const reservation = await selfServiceReservation(reservationId)
  if (!reservation || reservation.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be changed here' })
  }

  const current = await currentTicketLines(reservationId)
  const delta = ticketEditDelta(current, input.lines)

  const belowMinimum = belowMinimumTicketsReason(delta.desiredTotal)
  if (belowMinimum) throw createError({ statusCode: 400, statusMessage: belowMinimum })

  // Only an increase re-runs the same refusal a fresh booking would meet; a booker giving seats
  // back is never turned away by a window that has since closed (criterion 1, D-112 already live).
  if (delta.additions.length > 0) {
    const performance = await performanceById(reservation.performanceId)
    if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

    const refusal = saleRefusal(performance, new Date(), 'CUSTOMER')
    if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

    const cap = await configValue(event, 'PUBLIC_ORDER_SEAT_CAP')
    const capRefusal = overCapReason(input.lines, cap)
    if (capRefusal) throw createError({ statusCode: 400, statusMessage: capRefusal })

    const isMember = reservation.userId ? await hasCurrentMembership(event, reservation.userId, new Date()) : false
    const resolved = new Map((await bookableTicketTypes(reservation.performanceId, reservation.showId, isMember)).map(type => [type.id, type]))

    const priced = delta.additions.map((addition) => {
      const type = resolved.get(addition.ticketTypeId)
      if (!type) throw createError({ statusCode: 400, statusMessage: 'No such ticket type for this performance' })
      return { addition, type }
    })

    const additions = priced.flatMap(({ addition, type }) =>
      Array.from({ length: addition.quantity }, () => ({
        id: newId(),
        reservationId,
        performanceId: reservation.performanceId,
        ticketTypeId: type.id,
        pricePaid: type.price,
        priceSource: type.source,
      })))

    const result = await editReservationTickets({
      reservationId,
      performanceId: reservation.performanceId,
      capacity: effectiveCapacity(performance),
      additions,
      removals: delta.removals,
      desiredTotal: delta.desiredTotal,
      actorId: reservation.userId,
    })

    if (!result.applied) {
      throw createError({ statusCode: 409, statusMessage: 'This performance no longer has room for that change' })
    }
  }
  else if (delta.removals.length > 0) {
    const result = await editReservationTickets({
      reservationId,
      performanceId: reservation.performanceId,
      capacity: null,
      additions: [],
      removals: delta.removals,
      desiredTotal: delta.desiredTotal,
      actorId: reservation.userId,
    })

    if (!result.applied) {
      throw createError({ statusCode: 409, statusMessage: 'This booking can no longer be changed here' })
    }
  }

  const state = await reservationCurrentState(reservationId)
  return { status: state?.status ?? 'PENDING', totalPence: state?.totalPence ?? 0 }
})
