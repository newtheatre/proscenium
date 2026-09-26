import { SERIES_EDIT_REFUSAL, bookingTier, maskConflicts, refusalToEdit } from '#shared/utils/bookings'
import { blackoutOver, saysClosed } from '#shared/utils/blackouts'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { editDiff, editRequestForm, othersHeld, restartsTheClock } from '#shared/utils/requests'

// Change a request that is still waiting on a decision; every check a new request meets re-runs
// (C-108 criterion 4).
export default defineEventHandler(async (event) => {
  const { account, permissions } = await authority(event)
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, editRequestForm)

  const booking = await bookingFor(id)
  // Not yours and not there read the same, as they do for cancelling.
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'That is not your booking' })

  const refusal = refusalToEdit(booking, account.id)
  if (refusal) {
    throw createError({ statusCode: booking.userId === account.id ? 409 : 404, statusMessage: refusal })
  }

  // Asked, never assumed (C-111 criterion 1); only one side of the answer is built.
  if (booking.seriesId && input.scope === null) {
    throw createError({
      statusCode: 422,
      statusMessage: 'That booking is part of a series, so say whether you mean this one or all of them',
      data: { seriesId: booking.seriesId, needsScope: true },
    })
  }
  if (booking.seriesId && input.scope === 'series') {
    throw createError({ statusCode: 422, statusMessage: SERIES_EDIT_REFUSAL, data: { seriesId: booking.seriesId } })
  }

  const room = await findRoom(input.roomId)
  if (!room || !room.isActive) throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })

  const now = new Date()
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const startsAt = Math.floor(new Date(input.startsAt).getTime() / 1000)
  const endsAt = Math.floor(new Date(input.endsAt).getTime() / 1000)

  const shut = blackoutOver(await blackoutsAcross(startsAt, endsAt, room.id), room.id, { startsAt, endsAt })
  if (shut) {
    throw createError({
      statusCode: 422,
      statusMessage: saysClosed(shut),
      data: { failures: [{ reason: 'ROOM_CLOSED', says: saysClosed(shut) }], canRequest: false, blackout: shut },
    })
  }

  const verdict = judge({ startsAt: new Date(startsAt * 1000), endsAt: new Date(endsAt * 1000) }, resolvePolicy(room, await estatePolicy(event)), room, {
    now,
    isAdmin: permissions.has('rooms.write'),
    hasMembership: await hasCurrentMembership(event, account.id, now),
    activeBookings: othersHeld(await activeBookingsFor(account.id, nowSeconds), booking, nowSeconds),
    underPreApproval: await underPreApproval(event, account.id, now),
  })

  if (verdict.refusedOutright) {
    throw createError({
      statusCode: 422,
      statusMessage: verdict.failures[0]!.says,
      data: { failures: verdict.failures, canRequest: false },
    })
  }

  const purpose = await requirePurpose(event, input.purpose)
  const after = {
    roomId: room.id,
    title: input.title,
    attendees: input.attendees,
    startsAt,
    endsAt,
    tier: bookingTier(purpose, input.tier, permissions.has('rooms.write')),
    purpose,
    notes: input.notes,
    reason: input.reason,
  }
  const restartClock = restartsTheClock(booking, after)

  // Stays a request whatever the verdict: the approvers were asked, and an edit does not answer.
  const edited = await editPending({ ...after, id, userId: account.id, restartClock, now: nowSeconds })

  if (!edited.won) {
    switch (edited.why) {
      case 'missing':
        throw createError({ statusCode: 404, statusMessage: 'That is not your booking' })
      case 'settled':
        throw createError({ statusCode: 409, statusMessage: 'That booking has already been decided' })
      case 'gone':
        throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })
      case 'conflict':
        throw createError({
          statusCode: 409,
          statusMessage: 'Somebody already holds that slot, so your request is as it was',
          data: { conflicts: maskConflicts(edited.conflicts, permissions.has('rooms.read')) },
        })
    }
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.request.edited',
    target: `booking:${id}`,
    detail: { room: room.id, ...editDiff(booking, after), restartedClock: restartClock },
  }))

  return {
    ok: true,
    id,
    status: 'PENDING_APPROVAL' as const,
    failures: verdict.failures,
    restartedClock: restartClock,
    warning: overCapacity(room.capacity, input.attendees),
  }
})
