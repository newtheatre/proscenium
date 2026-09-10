import { sql } from 'drizzle-orm'
import { showCategoryForm } from '#shared/utils/show-categories'

// Add a show category. The name is held once, whatever the capitals (D-131 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, showCategoryForm)
  const id = newId()

  const created = await db.all<{ id: string }>(sql`
    INSERT INTO show_categories (id, name, sort, archived)
    SELECT ${id}, ${input.name}, ${input.sort}, 0
    WHERE NOT EXISTS (SELECT 1 FROM show_categories WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await showCategoryNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A category is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'show-category.created',
    target: `show-category:${id}`,
    detail: { name: input.name },
  }))

  return { ok: true, id }
})
