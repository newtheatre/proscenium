import { eq } from 'drizzle-orm'

// Delete a pass never issued. One that has can only be closed, and the refusal says so: every
// held pass and report still has to resolve against it (D-123 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await passTypeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  if (held.everIssued) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has been issued, so it can only be closed: every pass held against it still has to resolve`,
    })
  }

  // Its price points and covered shows cascade on the foreign key, so deleting the product is enough.
  await db.batch([
    db.delete(schema.passTypes).where(eq(schema.passTypes.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'pass-type.deleted',
      target: `pass-type:${id}`,
      detail: { name: held.name, slug: held.slug },
    })),
  ])

  return { ok: true }
})
