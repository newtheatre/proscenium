import { blackoutForm } from '#shared/utils/blackouts'

// Close a room, or every room, for a stated reason.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const input = await readValidatedBodyOrThrow(event, blackoutForm)

  if (input.roomId) {
    const room = await findRoom(input.roomId)
    if (!room) throw createError({ statusCode: 422, statusMessage: 'That room does not exist' })
  }

  const startsAt = Math.floor(new Date(input.startsAt).getTime() / 1000)
  const endsAt = Math.floor(new Date(input.endsAt).getTime() / 1000)
  const now = Math.floor(Date.now() / 1000)
  const id = newId()

  // Read before the write, because a cancelled booking no longer says whose it was, and the
  // write re-reads the same predicate so nothing booked in between is left standing.
  const stranded = await bookingsUnder({ roomId: input.roomId, startsAt, endsAt })

  await db.batch([
    db.insert(schema.roomBlackouts).values({
      id,
      roomId: input.roomId,
      reason: input.reason,
      startsAt,
      endsAt,
      createdBy: account.id,
    }),
    cancelStranded({ id, roomId: input.roomId, startsAt, endsAt }, now),
  ] as unknown as Parameters<typeof db.batch>[0])

  await repointSeries(stranded, now)

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.blackout.created',
    target: `blackout:${id}`,
    detail: { room: input.roomId, cancelled: stranded.length },
  }))

  const told = await tellStranded(event, stranded, input.reason)

  return { ok: true, id, cancelled: stranded.length, told }
})
