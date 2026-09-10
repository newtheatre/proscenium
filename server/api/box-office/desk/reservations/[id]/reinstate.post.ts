import { reinstateReservationForm, reinstateRefusal } from '#shared/utils/desk'

// D-118: bringing back a lapsed or self-cancelled hold, with capacity re-checked at the moment
// of the write, never at the moment the screen last read it (0003).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, reinstateReservationForm)

  const reservation = await deskReservation(id)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const refusal = reinstateRefusal(reservation.status, reservation.cancelledBy)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const performance = await performanceById(reservation.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const releaseMinutes = resolveHoldReleaseMinutes(
    performance.holdReleaseMinutesBefore,
    await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE'),
  )
  const capacity = effectiveCapacity(performance)
  const ticketCount = reservation.tickets.length

  const result = await reinstateReservation({
    reservationId: id,
    performanceId: reservation.performanceId,
    actorId: resolved.account.id,
    reason: input.reason,
    ticketCount,
    capacity,
    freshHoldExpiresAt: holdExpiresAt(performance.startsAt, releaseMinutes),
    previousStatus: reservation.status,
    previousHoldExpiresAt: reservation.holdExpiresAt,
  })

  if (!result.applied) {
    // Re-read rather than assumed: a race lost to another reinstatement reads differently from
    // one lost to capacity, and the officer is owed whichever actually happened (criterion 1).
    const current = await deskReservation(id)
    const stillRefused = current ? reinstateRefusal(current.status, current.cancelledBy) : 'This booking could not be found'
    if (stillRefused) throw createError({ statusCode: 409, statusMessage: stillRefused })

    const capacityFailure = await currentCapacityRefusal(reservation.performanceId, capacity, ticketCount)
    throw createError({
      statusCode: 409,
      statusMessage: capacityFailure?.says ?? 'This performance no longer has room for this booking',
    })
  }

  return { status: 'PENDING' as const }
})
