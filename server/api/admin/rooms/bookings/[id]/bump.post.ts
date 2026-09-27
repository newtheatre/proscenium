import { bumpForm, refusalToBump } from '#shared/utils/tiers'
import { formatLondon } from '#shared/utils/london'

// Take a confirmed booking for a higher priority, with a reason and a replacement offer.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, bumpForm)

  const displaced = await displacedBooking(id)
  if (!displaced) throw noSuch('booking')

  const order = await tierOrder(event)
  const now = Math.floor(Date.now() / 1000)

  // An equal or lower tier can never bump, and it is refused here rather than being argued about
  // afterwards (criterion 2).
  const refusal = refusalToBump(order, displaced, input, now)
  if (refusal) throw createError({ statusCode: 422, statusMessage: refusal })

  const claimant = await findById(input.userId)
  if (!claimant) throw createError({ statusCode: 422, statusMessage: 'That account does not exist' })

  // The claimant is handed the displaced booking's own slot, so a closure over it refuses the
  // bump as it would refuse the claimant booking it themselves (issue 1347).
  const shut = await closedOver(event, displaced.roomId, displaced.startsAt, displaced.endsAt)
  if (shut) throw shut

  const offer = nearestTo(displaced, await alternativesFor(displaced, event))

  const outcome = await performBump({
    displaced,
    claimantId: claimant.id,
    title: input.title,
    tier: input.tier,
    purpose: await requirePurpose(event, input.purpose),
    reason: input.reason,
    offer,
    now,
    offsets: await shiftOffsetDefaults(event),
  }, auditEntry({
    actorId: account.id,
    action: 'room.booking.bumped',
    target: `booking:${id}`,
    // The batch adds the booking that replaced it and the offer it held (criterion 5).
    detail: { room: displaced.roomId, tier: input.tier, was: displaced.tier },
  }))

  // The bump carries the closures itself, so one made since the check above stops it (0003).
  if (!outcome.won) {
    const closedSince = await closedOver(event, displaced.roomId, displaced.startsAt, displaced.endsAt)
    if (closedSince) throw closedSince
    throw createError({
      statusCode: 409,
      statusMessage: 'That booking changed while this was being worked out',
    })
  }

  // Immediately, with the reason and what they have instead: nobody should learn this by
  // finding somebody else in the room (criterion 3).
  await notify(event, {
    type: 'room.booking.bumped',
    userId: displaced.userId,
    context: {
      name: displaced.who,
      room: displaced.room,
      title: displaced.title,
      when: formatLondon(new Date(displaced.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      reason: input.reason,
      offered: outcome.offeredId && offer
        ? `${offer.room}, ${formatLondon(new Date(offer.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })}`
        : null,
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return {
    ok: true,
    id,
    status: 'BUMPED' as const,
    replacementId: outcome.replacementId,
    offered: outcome.offeredId
      ? { id: outcome.offeredId, room: offer!.room, startsAt: offer!.startsAt, endsAt: offer!.endsAt }
      : null,
  }
})
