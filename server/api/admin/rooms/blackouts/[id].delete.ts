import { eq } from 'drizzle-orm'

// Reopen a room. Bookings its closure cancelled stay cancelled.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''

  const removed = await db.delete(schema.roomBlackouts)
    .where(eq(schema.roomBlackouts.id, id))
    .returning({ id: schema.roomBlackouts.id, reason: schema.roomBlackouts.reason })

  if (removed.length === 0) throw createError({ statusCode: 404, statusMessage: 'No such blackout' })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.blackout.removed',
    target: `blackout:${id}`,
    // Nothing is restored: a member whose booking went has to make it again (criterion 5).
    detail: { restored: 0 },
  }))

  return { ok: true, id, restored: 0 }
})
