import { sql } from 'drizzle-orm'
import { categoryForm } from '#shared/utils/bar'

// Add a till category. The name is held once, whatever the capitals.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, categoryForm)
  const id = newId()

  // The predicate rides the write, so two managers naming the same thing at once produce one
  // category and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO bar_categories (id, name, sort, colour)
    SELECT ${id}, ${input.name}, ${input.sort}, ${input.colour ?? null}
    WHERE NOT EXISTS (SELECT 1 FROM bar_categories WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await categoryNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A category is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.category.created',
    target: `bar-category:${id}`,
    detail: { name: input.name, sort: input.sort },
  }))

  return { ok: true, id }
})
