import { sql } from 'drizzle-orm'

// Take a show's artwork away (D-132 criterion 6). The public frame falls back to the show's own
// gradient the moment the key is gone, so nothing else has to change for it to read deliberately.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const key = await posterKeyOf(id)
  if (!key) throw createError({ statusCode: 409, statusMessage: `${held.title} has no poster to remove` })

  await db.batch([
    db.run(sql`UPDATE shows SET poster_key = NULL, updated_at = unixepoch() WHERE id = ${id}`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'show.poster.removed',
      target: `show:${id}`,
      detail: { hadPoster: true },
    })),
  ])

  await forgetImage(key)

  return { ok: true, posterUrl: null }
})
