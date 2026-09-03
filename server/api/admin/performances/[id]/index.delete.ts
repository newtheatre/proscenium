import { eq } from 'drizzle-orm'

// Delete a performance nothing has been sold against. One that has sold seats is cancelled
// instead, and the refusal says so (D-121 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await performanceById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  if (held.soldTickets > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${plural(held.soldTickets, 'ticket')} have been sold for this performance, so it can only be cancelled: everybody holding one has to be refunded and told`,
    })
  }

  // The price overrides cascade at the foreign key, so the performance takes its own with it.
  await db.batch([
    db.delete(schema.performances).where(eq(schema.performances.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.deleted',
      target: `performance:${id}`,
      detail: { showId: held.showId, night: performanceNight(held.startsAt), venueId: held.venueId },
    })),
  ])

  return { ok: true }
})
