import { bookingForm, maskConflicts } from '#shared/utils/bookings'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { formatLondon } from '#shared/utils/london'

// Book a room.
export default defineEventHandler(async (event) => {
  // authority rather than requirePermission: booking is a member's own act, and the permissions
  // only decide whether they may exceed the maximum and see whose booking is in the way.
  const { account, permissions } = await authority(event)
  const input = await readValidatedBodyOrThrow(event, bookingForm)

  const room = await findRoom(input.roomId)
  // Retired rooms are not offered, so asking for one is asking for something gone.
  if (!room || !room.isActive) throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })

  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  const now = new Date()

  const estate = await estatePolicy(event)
  const policy = resolvePolicy(room, estate)

  const verdict = judge({ startsAt, endsAt }, policy, room, {
    now,
    isAdmin: permissions.has('rooms.write'),
    hasMembership: await hasCurrentMembership(event, account.id, now),
    activeBookings: await activeBookingsFor(account.id, Math.floor(now.getTime() / 1000)),
  })

  // Nothing an approver could agree to (a lapsed membership, a slot already past), so it is a
  // refusal rather than a request (C-105 criterion 4).
  if (verdict.refusedOutright) {
    throw createError({
      statusCode: 422,
      statusMessage: verdict.failures[0]!.says,
      data: { failures: verdict.failures, canRequest: false },
    })
  }

  // Out of policy, or a sensitive room. The request itself is C-108; this names what a request
  // would have to be for, so the screen can offer one.
  if (verdict.needsApproval) {
    throw createError({
      statusCode: 422,
      statusMessage: 'That booking needs somebody to agree to it',
      data: { failures: verdict.failures, canRequest: true, sensitive: room.sensitive },
    })
  }

  const claimed = await claimSlot({
    roomId: room.id,
    userId: account.id,
    title: input.title,
    attendees: input.attendees,
    startsAt: Math.floor(startsAt.getTime() / 1000),
    endsAt: Math.floor(endsAt.getTime() / 1000),
    tier: input.tier,
    status: 'CONFIRMED',
    notes: input.notes,
  })

  if (!claimed.won && claimed.why === 'gone') {
    throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })
  }
  if (!claimed.won) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Somebody booked that slot first',
      // Masked unless the reader may see whose it is (C-103 criteria 4 and 5).
      data: { conflicts: maskConflicts(claimed.conflicts, permissions.has('rooms.read')) },
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.booked',
    target: `booking:${claimed.id}`,
    detail: { room: room.id, tier: input.tier },
  }))

  await notify(event, {
    type: 'room.booking.confirmed',
    userId: account.id,
    context: {
      name: account.name,
      room: room.name,
      when: formatLondon(startsAt, { dateStyle: 'full', timeStyle: 'short' }),
      title: input.title,
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
    // The calendar file travels with the confirmation, so the booking reaches a phone without
    // anybody going looking for it (C-104 criterion 1).
    attachments: [bookingAttachment(event, {
      id: claimed.id,
      title: input.title,
      room: room.name,
      startsAt: Math.floor(startsAt.getTime() / 1000),
      endsAt: Math.floor(endsAt.getTime() / 1000),
      status: 'CONFIRMED',
      updatedAt: Math.floor(Date.now() / 1000),
    })],
  })

  return {
    ok: true,
    id: claimed.id,
    status: 'CONFIRMED' as const,
    // A warning, never a refusal: the room still fits what somebody agreed to (C-101 criterion 5).
    warning: overCapacity(room.capacity, input.attendees),
  }
})
