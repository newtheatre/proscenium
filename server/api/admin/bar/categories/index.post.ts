import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { categoryForm } from '#shared/utils/bar'

// Add a till category, last on the till unless a place is named (0143). The name is held once,
// whatever the capitals.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, categoryForm)
  const id = newId()

  // The predicate rides the write, so two managers naming the same thing at once produce one
  // category and a refusal rather than a constraint error (0003, 0006, 0049).
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.category.created',
    target: `bar-category:${id}`,
    detail: changes({ name: [null, input.name], sort: [null, input.sort ?? null] }),
  })
  const [created] = await db.batch([
    db.all<{ id: string }>(sql`
      INSERT INTO bar_categories (id, name, sort, colour)
      SELECT ${id}, ${input.name}, ${input.sort ?? sql`(SELECT coalesce(max(sort) + 1, 0) FROM bar_categories)`}, ${input.colour ?? null}
      WHERE NOT EXISTS (SELECT 1 FROM bar_categories WHERE name = ${input.name} COLLATE NOCASE)
      RETURNING id
    `),
    db.all<{ id: string }>(categoryAuditWithSort(entry, id)),
  ])
  const applied = created.length > 0

  if (!applied) {
    const taken = await claimName('category', input.name)
    throw createError({ statusCode: 409, statusMessage: `A category is already called ${taken?.name ?? input.name}` })
  }

  return { ok: true, id }
})
