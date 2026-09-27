import { eq } from 'drizzle-orm'

// Reopen a room. Bookings its closure cancelled stay cancelled.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''

  const removed = await auditedWrite(
    db.delete(schema.roomBlackouts).where(eq(schema.roomBlackouts.id, id)).returning({ id: schema.roomBlackouts.id }),
    auditEntry({
      actorId: account.id,
      action: 'room.blackout.removed',
      target: `blackout:${id}`,
      // Nothing is restored: a member whose booking went has to make it again (criterion 5).
      detail: { restored: 0 },
    }),
  )

  if (!removed) throw noSuch('closure')

  return { ok: true, id, restored: 0 }
})
