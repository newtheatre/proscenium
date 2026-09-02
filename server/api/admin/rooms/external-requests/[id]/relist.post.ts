import { eq } from 'drizzle-orm'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { refusalToRelist } from '#shared/utils/external-requests'
import { relistForm } from '#shared/utils/approvals'
import { formatLondon } from '#shared/utils/london'

// Move a request into one of our rooms, which claims the slot and so can fail.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, relistForm)

  const request = await externalRequest(id)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request' })

  const refusal = refusalToRelist(request)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const room = (await listRooms(true)).find(one => one.id === input.roomId)
  if (!room) throw createError({ statusCode: 422, statusMessage: 'That room is not one of ours, or it is retired' })

  // Choosing the room is not a licence to skip the policy: a span outside it still goes to the
  // queue, it just goes there against a room instead of nothing (C-123 criterion 4).
  const now = new Date()
  const verdict = judge(
    { startsAt: new Date(request.startsAt * 1000), endsAt: new Date(request.endsAt * 1000) },
    resolvePolicy(room, await estatePolicy(event)),
    room,
    {
      now,
      isAdmin: false,
      hasMembership: await hasCurrentMembership(event, request.userId, now),
      activeBookings: 0,
      underPreApproval: await underPreApproval(event, request.userId, now),
    },
  )

  // The predicate rides the INSERT, so two officers claiming one slot cannot both win (0003).
  const claim = await claimSlot({
    roomId: room.id,
    userId: request.userId,
    title: request.title,
    attendees: request.attendees,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    tier: 'GENERAL',
    purpose: request.purpose,
    status: verdict.needsApproval ? 'PENDING_APPROVAL' : 'CONFIRMED',
    notes: request.notes,
  })

  if (!claim.won) {
    throw createError({
      statusCode: claim.why === 'gone' ? 410 : 409,
      statusMessage: claim.why === 'gone'
        ? 'That room is no longer bookable'
        : `Somebody already holds ${room.name} for that span`,
      data: claim.why === 'conflict' ? { conflicts: claim.conflicts } : undefined,
    })
  }

  const seconds = Math.floor(Date.now() / 1000)
  const moved = await moveRequest(id, ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED'], {
    status: 'CANCELLED',
    converted_to_booking_id: claim.id,
    updated_at: seconds,
  })

  // The booking is already claimed, so a request that moved on under us leaves it to be undone
  // rather than left holding a slot for something nobody asked for.
  if (!moved) {
    await db.update(schema.roomBookings)
      .set({ status: 'CANCELLED', updatedAt: seconds })
      .where(eq(schema.roomBookings.id, claim.id))
    throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })
  }

  await db.update(schema.roomBookings)
    .set({ convertedFromRequestId: id })
    .where(eq(schema.roomBookings.id, claim.id))

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.request.relisted',
    target: `external:${id}`,
    detail: { became: claim.id, room: room.id, needsApproval: verdict.needsApproval },
  }))

  await notify(event, {
    type: 'external.request.relisted',
    userId: request.userId,
    context: {
      name: request.who,
      title: request.title,
      room: room.name,
      settled: !verdict.needsApproval,
      when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, became: claim.id, status: verdict.needsApproval ? 'PENDING_APPROVAL' : 'CONFIRMED' }
})
