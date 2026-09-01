import { spaceForm } from '#shared/utils/external-spaces'

// Add a room the SU manages.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const input = await readValidatedBodyOrThrow(event, spaceForm)

  const id = newId()
  try {
    await db.insert(schema.externalSpaces).values({ id, ...input })
  }
  catch {
    // The name is unique, because two rooms called the same thing is a catalogue nobody trusts.
    throw createError({ statusCode: 409, statusMessage: 'A room with that name is already listed' })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.space.created',
    target: `space:${id}`,
    detail: { name: input.name },
  }))

  return { ok: true, id }
})
