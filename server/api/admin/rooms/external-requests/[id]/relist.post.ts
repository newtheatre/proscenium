import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { bookingTier } from '#shared/utils/bookings'
import { refusalToRelist } from '#shared/utils/external-requests'
import { relistForm } from '#shared/utils/approvals'
import { saysRoomSpan } from '#shared/utils/room-messages'

// Move a request into one of our rooms, which claims the slot and so can fail.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, relistForm)

  const request = await externalRequest(id)
  if (!request) throw noSuch('request')

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
      ...await membershipFacts(event, request.userId, now),
      // Counted as the booking form counts it, or a move would be a way round the cap.
      activeBookings: await activeBookingsFor(request.userId, Math.floor(now.getTime() / 1000)),
      underPreApproval: await underPreApproval(event, request.userId, now),
    },
  )

  // A slot already gone is no booking at all, and approving does not look at the clock.
  const gone = verdict.failures.find(failure => failure.reason === 'IN_THE_PAST')
  if (gone) throw createError({ statusCode: 422, statusMessage: gone.says })

  // Any other outright refusal (a lapsed membership) queues: confirming it would wave it through.
  const queued = verdict.needsApproval || verdict.refusedOutright

  // The member asked, so the tier is theirs as any member booking's is (C-115 criterion 1).
  const tier = bookingTier(request.purpose, undefined, false)
  const claim = {
    roomId: room.id,
    userId: request.userId,
    title: request.title,
    attendees: request.attendees,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    tier,
    purpose: request.purpose,
    status: queued ? 'PENDING_APPROVAL' as const : 'CONFIRMED' as const,
    notes: request.notes,
    offsets: await shiftOffsetDefaults(event),
  }
  const claimId = newId()
  const entry = auditEntry({
    actorId: account.id,
    action: 'external.request.relisted',
    target: `external:${id}`,
    detail: { became: claimId, room: room.id, tier, needsApproval: queued },
  })

  // The predicate rides the INSERT, so two officers claiming one slot cannot both win (0003), and
  // the claim, the move and the audit land together or not at all (0049).
  const statements = relistStatements({ requestId: id, claimId, claim, now: Math.floor(Date.now() / 1000) }, entry)
  const [claimed] = await runBatch(statements)

  if (!claimed!.length) {
    const current = await externalRequest(id)
    if (!current || refusalToRelist(current)) throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })

    const lost = await whyClaimLost(claim)
    if (lost.why === 'closed') {
      throw (await closedOver(event, room.id, request.startsAt, request.endsAt))
        ?? createError({ statusCode: 409, statusMessage: `Somebody already holds ${room.name} for that span` })
    }
    throw createError({
      statusCode: lost.why === 'gone' ? 410 : 409,
      statusMessage: lost.why === 'gone' ? 'That room is no longer bookable' : `Somebody already holds ${room.name} for that span`,
      data: lost.why === 'conflict' ? { conflicts: lost.conflicts } : undefined,
    })
  }

  await notify(event, {
    type: 'external.request.relisted',
    userId: request.userId,
    about: [id, claimId],
    context: {
      name: request.who,
      title: request.title,
      room: room.name,
      settled: !queued,
      when: saysRoomSpan(request.startsAt, request.endsAt),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, became: claimId, status: claim.status }
})
