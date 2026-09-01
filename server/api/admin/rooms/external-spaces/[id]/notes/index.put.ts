import { spaceNoteForm } from '#shared/utils/external-spaces'

// Record what a room is, or is not, good for. One verdict per purpose, so this replaces.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, spaceNoteForm)

  const space = await findSpace(id)
  if (!space) throw createError({ statusCode: 404, statusMessage: 'No such room' })

  const purpose = await requirePurpose(event, input.purpose)
  const now = Math.floor(Date.now() / 1000)

  // Upsert on the pair, because two verdicts about one room and one purpose would leave nobody
  // knowing which applied. Editable rather than superseding: this is what we believe today.
  await db.insert(schema.externalSpaceNotes)
    .values({ id: newId(), spaceId: id, purpose, verdict: input.verdict, reason: input.reason, writtenBy: account.id })
    .onConflictDoUpdate({
      target: [schema.externalSpaceNotes.spaceId, schema.externalSpaceNotes.purpose],
      set: { verdict: input.verdict, reason: input.reason, writtenBy: account.id, updatedAt: now },
    })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.space.note.set',
    // The purpose and the verdict, never the wording: a note may describe a person's experience.
    detail: { space: id, purpose, verdict: input.verdict },
    target: `space:${id}`,
  }))

  return { ok: true, spaceId: id, purpose, verdict: input.verdict }
})
