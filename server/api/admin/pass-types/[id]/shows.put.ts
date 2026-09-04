import { and, eq } from 'drizzle-orm'
import { passTypeShowsForm } from '#shared/utils/pass-types'

// Replace the full set of shows a pass covers. Extending is ordinary box office work; dropping a
// show that still has a live pass against it needs the manager permission (D-123 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await passTypeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  const { showIds } = await readValidatedBodyOrThrow(event, passTypeShowsForm)

  const known = new Set((await listShowOptions()).map(show => show.id))
  if (showIds.some(showId => !known.has(showId))) {
    throw createError({ statusCode: 400, statusMessage: 'No such show' })
  }

  const removed = held.showIds.filter(showId => !showIds.includes(showId))
  const added = showIds.filter(showId => !held.showIds.includes(showId))
  if (removed.length === 0 && added.length === 0) return { ok: true }

  for (const showId of removed) {
    const [row] = await db.all<{ live: number }>(liveCoverageQuery(id, showId))
    if ((row?.live ?? 0) > 0 && !resolved.permissions.has('ticketing.manage')) {
      throw createError({ statusCode: 403, statusMessage: 'A manager must remove a show with a live pass against it' })
    }
  }

  await db.batch([
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'pass-type.shows.updated',
      target: `pass-type:${id}`,
      detail: { added, removed },
    })),
    ...removed.map(showId => db.delete(schema.passTypeShows)
      .where(and(eq(schema.passTypeShows.passTypeId, id), eq(schema.passTypeShows.showId, showId)))),
    ...added.map(showId => db.insert(schema.passTypeShows).values({ id: newId(), passTypeId: id, showId })),
  ])

  return { ok: true }
})
