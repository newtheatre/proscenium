import { and, asc, eq, gt } from 'drizzle-orm'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { formatLondon } from '#shared/utils/london'
import { rejudgeForm } from '#shared/utils/no-shows'
import type { DecisionOutcome } from '#server/utils/approvals'
import type { CalendarEvent } from '#shared/utils/ics'

// Judge again a member's waiting requests once a withdrawn no-show takes them off pre-approval.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const input = await readValidatedBodyOrThrow(event, rejudgeForm)

  const member = await findById(input.userId)
  if (!member) throw noSuch('account')

  const now = new Date()
  const seconds = Math.floor(now.getTime() / 1000)
  // Still on the ladder, every booking still waits for a person, which is what the ladder is for.
  if (await underPreApproval(event, member.id, now)) {
    throw createError({ statusCode: 409, statusMessage: 'Their bookings are still checked by a person first, so nothing is judged again' })
  }

  const waiting = await db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    title: schema.roomBookings.title,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
  })
    .from(schema.roomBookings)
    .where(and(
      eq(schema.roomBookings.userId, member.id),
      eq(schema.roomBookings.status, 'PENDING_APPROVAL'),
      gt(schema.roomBookings.endsAt, seconds),
    ))
    .orderBy(asc(schema.roomBookings.startsAt))
    .limit(LIST_CAP)

  const estate = await estatePolicy(event)
  const membership = await membershipFacts(event, member.id, now)
  const offsets = await shiftOffsetDefaults(event)
  const confirmed: (typeof waiting[number] & { room: string })[] = []
  const outcomes: DecisionOutcome[] = []

  for (const one of waiting) {
    const room = await findRoom(one.roomId)
    if (!room || await closedOver(event, room.id, one.startsAt, one.endsAt)) continue

    // As if asked today by somebody off the ladder, this request not counted against its own cap.
    const verdict = judge({ startsAt: new Date(one.startsAt * 1000), endsAt: new Date(one.endsAt * 1000) }, resolvePolicy(room, estate), room, {
      now,
      isAdmin: false,
      ...membership,
      activeBookings: (await activeBookingsFor(member.id, seconds)) - 1,
      underPreApproval: false,
    })
    if (verdict.needsApproval || verdict.refusedOutright) continue

    const outcome = await approveOne(one.id, account.id, null, seconds, offsets, auditEntry({
      actorId: account.id,
      action: 'room.request.approved',
      target: `booking:${one.id}`,
      detail: { room: room.id, rejudged: true },
    }))
    outcomes.push(outcome)
    if (outcome.ok) confirmed.push({ ...one, room: room.name })
  }

  // The usual approval message, one for the lot, carrying the calendar file (C-109, C-104).
  if (confirmed.length > 0) {
    const events: CalendarEvent[] = confirmed.map(one => ({ id: one.id, title: one.title, room: one.room, startsAt: one.startsAt, endsAt: one.endsAt, status: 'CONFIRMED', updatedAt: seconds }))
    await notify(event, {
      type: 'room.request.approved',
      userId: member.id,
      context: {
        name: '',
        bookings: confirmed.map(one => ({
          room: one.room,
          title: one.title,
          when: formatLondon(new Date(one.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        })),
        reason: null,
        moved: null,
        roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
      },
      attachments: [bookingsAttachment(event, events)],
    })
  }

  return {
    ok: true,
    confirmed: confirmed.length,
    waiting: waiting.length - confirmed.length,
    outcomes,
  }
})
