import { expand, seriesForm } from '#shared/utils/series'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { maskConflicts } from '#shared/utils/bookings'
import { formatLondon } from '#shared/utils/london'
import type { OccurrenceRefusal } from '#server/utils/series'

// Book a term of rehearsals as one series.
export default defineEventHandler(async (event) => {
  const { account, permissions } = await authority(event)
  const input = await readValidatedBodyOrThrow(event, seriesForm)

  const room = await findRoom(input.roomId)
  if (!room || !room.isActive) throw createError({ statusCode: 410, statusMessage: 'That room is no longer bookable' })

  const cap = await configValue(event, 'ROOM_SERIES_MAX_OCCURRENCES')
  if (input.occurrences > cap) {
    throw createError({ statusCode: 422, statusMessage: `A series runs to ${cap} occurrences at most` })
  }

  // Expanded first, then the dropped weeks removed, so resubmitting without a bad one leaves
  // every other week on the day it was already on (criterion 3).
  const skipped = new Set(input.skip)
  const occurrences = expand({
    frequency: input.frequency,
    weekdays: input.weekdays,
    startsOn: input.startsOn,
    from: input.from,
    to: input.to,
    occurrences: input.occurrences,
  }).filter(one => !skipped.has(one.day))

  if (occurrences.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'That leaves no occurrences to book' })
  }

  const now = new Date()
  const policy = resolvePolicy(room, await estatePolicy(event))
  const isAdmin = permissions.has('rooms.write')
  const hasMembership = await hasCurrentMembership(event, account.id, now)
  const alreadyHeld = await activeBookingsFor(account.id, Math.floor(now.getTime() / 1000))
  const clashes = await conflictsAcross(room.id, occurrences)

  // Judged before any row is written, each counting against the cap as it goes: a series counts
  // each occurrence, which is what the setting says (criterion 2).
  const refusals: OccurrenceRefusal[] = []
  let needsApproval = false

  for (const [at, one] of occurrences.entries()) {
    const verdict = judge({ startsAt: one.startsAt, endsAt: one.endsAt }, policy, room, {
      now,
      isAdmin,
      hasMembership,
      activeBookings: alreadyHeld + at,
    })

    const conflicts = clashes.get(one.occurrence) ?? []
    needsApproval ||= verdict.needsApproval

    if (verdict.refusedOutright || conflicts.length > 0) {
      refusals.push({
        occurrence: one.occurrence,
        day: one.day,
        failures: verdict.failures,
        conflicts: maskConflicts(conflicts, permissions.has('rooms.read')),
      })
    }
  }

  // Nothing is written when any fails, and the answer names each one, so a member drops those
  // weeks rather than guessing at them (criterion 3).
  if (refusals.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `${plural(refusals.length, 'occurrence')} cannot be booked`,
      data: { refusals, total: occurrences.length },
    })
  }

  const seriesId = newId()
  const recurrence = {
    frequency: input.frequency,
    weekdays: input.weekdays,
    startsOn: input.startsOn,
    from: input.from,
    to: input.to,
    occurrences: occurrences.length,
  }

  // The whole series confirms or the whole series queues: an occurrence is never a different
  // kind of thing from its siblings (criterion 6).
  const status = needsApproval ? 'PENDING_APPROVAL' as const : 'CONFIRMED' as const

  try {
    await writeSeries({
      seriesId,
      userId: account.id,
      roomId: room.id,
      title: input.title,
      attendees: input.attendees,
      tier: input.tier,
      notes: input.notes,
      status,
      recurrence,
      occurrences,
    })
  }
  catch {
    // The completeness assertion raised: a slot was claimed between the check and the write,
    // and nothing was written (0035).
    throw createError({
      statusCode: 409,
      statusMessage: 'Somebody booked one of those slots while this was being worked out',
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: status === 'CONFIRMED' ? 'room.series.booked' : 'room.series.requested',
    target: `series:${seriesId}`,
    detail: { room: room.id, occurrences: occurrences.length, frequency: input.frequency },
  }))

  await notify(event, {
    type: status === 'CONFIRMED' ? 'room.series.confirmed' : 'room.series.requested',
    userId: account.id,
    context: {
      name: account.name,
      room: room.name,
      title: input.title,
      count: occurrences.length,
      first: formatLondon(occurrences[0]!.startsAt, { dateStyle: 'full', timeStyle: 'short' }),
      last: formatLondon(occurrences.at(-1)!.startsAt, { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return {
    ok: true,
    id: seriesId,
    status,
    occurrences: occurrences.map(one => ({ occurrence: one.occurrence, day: one.day })),
    warning: overCapacity(room.capacity, input.attendees),
  }
})
