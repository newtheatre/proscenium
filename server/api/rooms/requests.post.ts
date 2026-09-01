import { requestForm } from '#shared/utils/requests'
import { maskConflicts } from '#shared/utils/bookings'
import { blackoutOver, saysClosed } from '#shared/utils/blackouts'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { formatLondon } from '#shared/utils/london'

// Ask for a slot the policy will not confirm on its own.
export default defineEventHandler(async (event) => {
  const { account, permissions } = await authority(event)
  const input = await readValidatedBodyOrThrow(event, requestForm)

  const room = await findRoom(input.roomId)
  if (!room || !room.isActive) throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })

  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  const now = new Date()

  // Nothing an approver could agree to either: the room is shut, and closing it was their doing.
  const shut = blackoutOver(
    await blackoutsAcross(Math.floor(startsAt.getTime() / 1000), Math.floor(endsAt.getTime() / 1000), room.id),
    room.id,
    { startsAt: Math.floor(startsAt.getTime() / 1000), endsAt: Math.floor(endsAt.getTime() / 1000) },
  )
  if (shut) {
    throw createError({
      statusCode: 422,
      statusMessage: saysClosed(shut),
      data: { failures: [{ reason: 'ROOM_CLOSED', says: saysClosed(shut) }], canRequest: false, blackout: shut },
    })
  }

  const verdict = judge({ startsAt, endsAt }, resolvePolicy(room, await estatePolicy(event)), room, {
    now,
    isAdmin: permissions.has('rooms.write'),
    hasMembership: await hasCurrentMembership(event, account.id, now),
    activeBookings: await activeBookingsFor(account.id, Math.floor(now.getTime() / 1000)),
  })

  // Nothing an approver could agree to, so it is not a request either (C-105 criterion 4).
  if (verdict.refusedOutright) {
    throw createError({
      statusCode: 422,
      statusMessage: verdict.failures[0]!.says,
      data: { failures: verdict.failures, canRequest: false },
    })
  }

  // A request holds its slot, or an instant booking would take it from under a decision somebody
  // is in the middle of making (criterion 2).
  const claimed = await claimSlot({
    roomId: room.id,
    userId: account.id,
    title: input.title,
    attendees: input.attendees,
    startsAt: Math.floor(startsAt.getTime() / 1000),
    endsAt: Math.floor(endsAt.getTime() / 1000),
    tier: input.tier,
    status: 'PENDING_APPROVAL',
    notes: input.notes,
    reason: input.reason,
  })

  if (!claimed.won && claimed.why === 'gone') {
    throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })
  }
  if (!claimed.won) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Somebody booked that slot first',
      data: { conflicts: maskConflicts(claimed.conflicts, permissions.has('rooms.read')) },
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.requested',
    target: `booking:${claimed.id}`,
    // The rules it broke, never the reason: that is the member's own words (0011).
    detail: { room: room.id, failed: verdict.failures.map(failure => failure.reason) },
  }))

  await notify(event, {
    type: 'room.request.received',
    userId: account.id,
    context: {
      name: account.name,
      room: room.name,
      when: formatLondon(startsAt, { dateStyle: 'full', timeStyle: 'short' }),
      title: input.title,
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  // Told on arrival, not only once it is stale. A muted approver's send is skipped and logged,
  // and the request still stands on the queue, so no inbox can orphan one (C-113 criterion 4).
  for (const approver of await approvers()) {
    await notify(event, {
      type: 'room.request.raised',
      userId: approver.id,
      context: {
        name: approver.name,
        who: account.name,
        room: room.name,
        title: input.title,
        when: formatLondon(startsAt, { dateStyle: 'full', timeStyle: 'short' }),
        queueUrl: `${useRuntimeConfig(event).public.baseURL}/admin/requests`,
      },
    })
  }

  return {
    ok: true,
    id: claimed.id,
    status: 'PENDING_APPROVAL' as const,
    failures: verdict.failures,
    warning: overCapacity(room.capacity, input.attendees),
  }
})
