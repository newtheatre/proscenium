import { and, eq } from 'drizzle-orm'

// Forget what we thought about a room for one purpose.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const purpose = getRouterParam(event, 'purpose') ?? ''

  const removed = await auditedWrite(
    db.delete(schema.externalSpaceNotes)
      .where(and(eq(schema.externalSpaceNotes.spaceId, id), eq(schema.externalSpaceNotes.purpose, purpose)))
      .returning({ id: schema.externalSpaceNotes.id }),
    auditEntry({ actorId: account.id, action: 'external.space.note.removed', target: `space:${id}`, detail: { space: id, purpose } }),
  )

  if (!removed) throw noSuch('note')

  return { ok: true, spaceId: id, purpose }
})
