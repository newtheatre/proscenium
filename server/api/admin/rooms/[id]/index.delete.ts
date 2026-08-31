import { eq } from 'drizzle-orm'

// Retire a room. Never a deletion: a booking made last term still names it (C-101 criterion 2).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''

  const room = await findRoom(id)
  if (!room) throw createError({ statusCode: 404, statusMessage: 'No such room' })
  if (!room.isActive) return { ok: true, alreadyRetired: true }

  await db.batch([
    db.update(schema.rooms)
      .set({ isActive: false, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.rooms.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'room.updated',
      target: `room:${id}`,
      detail: changes({ isActive: [true, false] }),
    })),
  ])

  return { ok: true, alreadyRetired: false }
})
