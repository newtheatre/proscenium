import { eq } from 'drizzle-orm'

// Delete a vocabulary entry no show carries. One a show carries can only be archived, which is
// what the junction's restrict already says and this says in words (D-102 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await contentWarningById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such content warning' })

  if (held.showCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.title} is carried by ${plural(held.showCount, 'show')}, so it can only be archived: `
        + 'every show page that names it still has to resolve',
    })
  }

  await db.batch([
    db.delete(schema.contentWarnings).where(eq(schema.contentWarnings.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'content-warning.deleted',
      target: `content-warning:${id}`,
      detail: { slug: held.slug, title: held.title, kind: held.kind },
    })),
  ])

  return { ok: true }
})
