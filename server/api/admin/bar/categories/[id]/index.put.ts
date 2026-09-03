import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { categoryForm } from '#shared/utils/bar'

// Edit a till category. The order takes effect on the next screen the till draws (F-111).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await categoryById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  const input = await readValidatedBodyOrThrow(event, categoryForm)
  const colour = input.colour ?? null

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE bar_categories
    SET name = ${input.name}, sort = ${input.sort}, colour = ${colour}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM bar_categories WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await categoryNamed(input.name, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such category' })
    throw createError({ statusCode: 409, statusMessage: `A category is already called ${taken.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.category.updated',
    target: `bar-category:${id}`,
    detail: changes({
      name: [held.name, input.name],
      sort: [held.sort, input.sort],
      colour: [held.colour, colour],
    }),
  }))

  return { ok: true }
})
