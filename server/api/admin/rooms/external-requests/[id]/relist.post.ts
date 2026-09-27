import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { bookingTier } from '#shared/utils/bookings'
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
      hasMembership: await hasCurrentMembership(event, request.userId, now),
      activeBookings: 0,
      underPreApproval: await underPreApproval(event, request.userId, now),
    },
  )

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
    status: verdict.needsApproval ? 'PENDING_APPROVAL' as const : 'CONFIRMED' as const,
    notes: request.notes,
    offsets: await shiftOffsetDefaults(event),
  }
  const claimId = newId()
  const entry = auditEntry({
    actorId: account.id,
    action: 'external.request.relisted',
    target: `external:${id}`,
    detail: { became: claimId, room: room.id, tier, needsApproval: verdict.needsApproval },
  })

  // The predicate rides the INSERT, so two officers claiming one slot cannot both win (0003), and
  // the claim, the move and the audit land together or not at all (0049).
  const statements = relistStatements({ requestId: id, claimId, claim, now: Math.floor(Date.now() / 1000) }, entry)
  const [claimed] = await db.batch(statements.map(statement => db.all(statement)) as unknown as Parameters<typeof db.batch>[0])

  if (!(claimed as unknown[]).length) {
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
    context: {
      name: request.who,
      title: request.title,
      room: room.name,
      settled: !verdict.needsApproval,
      when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, became: claimId, status: claim.status }
})
