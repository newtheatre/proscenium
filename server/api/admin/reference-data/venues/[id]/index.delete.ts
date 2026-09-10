import { sql } from 'drizzle-orm'

// Delete a venue nothing has ever used. One in use can only be retired (D-131 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await venueById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such venue' })

  if (held.inUse) {
    const holding = await venueInUseBy(id)
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} can only be retired: ${holding.map(reference => reference.why).join(', ')}`,
    })
  }

  await db.batch([
    db.run(sql`DELETE FROM venues WHERE id = ${id}`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'venue.deleted',
      target: `venue:${id}`,
      detail: { name: held.name },
    })),
  ])

  return { ok: true }
})
