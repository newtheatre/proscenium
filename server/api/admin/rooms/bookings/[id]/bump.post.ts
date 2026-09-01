import { bumpForm, refusalToBump } from '#shared/utils/tiers'
import { formatLondon } from '#shared/utils/london'

// Take a confirmed booking for a higher priority, with a reason and a replacement offer.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, bumpForm)

  const displaced = await displacedBooking(id)
  if (!displaced) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const order = await tierOrder(event)
  const now = Math.floor(Date.now() / 1000)

  // An equal or lower tier can never bump, and it is refused here rather than being argued about
  // afterwards (criterion 2).
  const refusal = refusalToBump(order, displaced, input, now)
  if (refusal) throw createError({ statusCode: 422, statusMessage: refusal })

  const claimant = await findById(input.userId)
  if (!claimant) throw createError({ statusCode: 422, statusMessage: 'That account does not exist' })

  const offer = nearestTo(displaced, await alternativesFor(displaced))

  const outcome = await performBump({
    displaced,
    claimantId: claimant.id,
    title: input.title,
    tier: input.tier,
    purpose: await requirePurpose(event, input.purpose),
    reason: input.reason,
    offer,
    now,
  })

  if (!outcome.won) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That booking changed while this was being worked out',
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.booking.bumped',
    target: `booking:${id}`,
    // The displaced booking, the one that replaced it, and the offer made (criterion 5).
    detail: {
      room: displaced.roomId,
      replacedBy: outcome.replacementId,
      offered: outcome.offeredId,
      tier: input.tier,
      was: displaced.tier,
    },
  }))

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
