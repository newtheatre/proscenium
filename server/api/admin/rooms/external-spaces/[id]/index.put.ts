import { eq } from 'drizzle-orm'
import { spaceForm } from '#shared/utils/external-spaces'

// Change a room the SU manages, or retire it.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, spaceForm)

  const before = await findSpace(id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such room' })

  const changed = await db.update(schema.externalSpaces)
    .set({ ...input, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.externalSpaces.id, id))
    .returning({ id: schema.externalSpaces.id })

  if (changed.length === 0) throw createError({ statusCode: 404, statusMessage: 'No such room' })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.space.updated',
    target: `space:${id}`,
    detail: { name: input.name, retired: !input.isActive },
  }))

  return { ok: true, id }
})
