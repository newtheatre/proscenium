import { sql } from 'drizzle-orm'
import { posterUrl } from '#shared/utils/seo'

// Attach or replace a show's artwork (D-132 criterion 6). The row is repointed before the old blob
// is forgotten, so a failure anywhere leaves the show with the poster it already had.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw noSuch('show')

  const previousKey = await posterKeyOf(id)
  const stored = await storePosterImage(event, { showId: id, fieldName: 'poster', previousKey })

  await db.batch([
    db.run(sql`UPDATE shows SET poster_key = ${stored.key}, updated_at = unixepoch() WHERE id = ${id}`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'show.poster.uploaded',
      target: `show:${id}`,
      detail: { replaced: previousKey !== null },
    })),
  ])

  await stored.forgetPrevious()

  return { ok: true, posterUrl: posterUrl(stored.key) }
})
