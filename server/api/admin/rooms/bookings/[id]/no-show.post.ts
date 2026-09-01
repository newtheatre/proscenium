import { noShowForm, refusalToRecord } from '#shared/utils/no-shows'

// Record that nobody turned up to a booking.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, noShowForm)

  const booking = await bookingFor(id)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const now = Math.floor(Date.now() / 1000)
  const refusal = refusalToRecord(booking, now)
  if (refusal) throw createError({ statusCode: 422, statusMessage: refusal })

  // Already standing, so recording it again would double-count nothing but would still be a
  // second fact about one night.
  const latest = await latestFor(id)
  if (latest?.kind === 'RECORDED') {
    throw createError({ statusCode: 409, statusMessage: 'That booking is already marked as a no-show' })
  }

  const recordId = newId()
  await db.insert(schema.roomNoShows).values({
    id: recordId,
    bookingId: id,
    userId: booking.userId,
    kind: 'RECORDED',
    reason: input.reason,
    supersedesId: latest?.id ?? null,
    recordedBy: account.id,
    recordedAt: now,
  })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.no-show.recorded',
    target: `booking:${id}`,
    detail: { room: booking.roomId, record: recordId },
  }))

  const standing = await standingOf(event, booking.userId)

  // Told when it changes something for them, not for every mark: a first no-show that carries no
  // consequence is a note, and a message about nothing teaches people to ignore messages.
  if (standing.standing !== 'CLEAR') {
    await notify(event, {
      type: 'room.no-show.recorded',
      userId: booking.userId,
      context: {
        name: '',
        room: booking.room,
        title: booking.title,
        count: standing.count,
        preApprovalAt: standing.ladder.preApprovalAt,
        underPreApproval: standing.standing === 'PRE_APPROVAL',
        roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
      },
    })
  }

  return { ok: true, id: recordId, bookingId: id, ...standing }
})
