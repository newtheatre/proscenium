import { eq } from 'drizzle-orm'

// Delete a show nothing has ever been sold against, with its performances. One with sold seats is
// unpublished and its performances cancelled instead, and the refusal says so (D-121 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  if (held.soldTickets > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.title} has sold ${plural(held.soldTickets, 'ticket')}, so it cannot be deleted: unpublish it, and cancel the performances that are not going ahead`,
    })
  }

  // The performances, the content warnings and both sets of price overrides cascade at the
  // foreign key, so this one statement takes the show's configuration with it.
  await db.batch([
    db.delete(schema.shows).where(eq(schema.shows.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'show.deleted',
      target: `show:${id}`,
      detail: { slug: held.slug, title: held.title, performances: held.performanceCount },
    })),
  ])

  return { ok: true }
})
