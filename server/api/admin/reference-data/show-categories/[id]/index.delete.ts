import { sql } from 'drizzle-orm'

// Delete a category no show belongs to. One with shows can only be retired (D-131 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showCategoryById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  if (held.inUse) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} can only be retired: a show belongs to it` })
  }

  await db.batch([
    db.run(sql`DELETE FROM show_categories WHERE id = ${id}`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'show-category.deleted',
      target: `show-category:${id}`,
      detail: { name: held.name },
    })),
  ])

  return { ok: true }
})
