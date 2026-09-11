import { eq, sql } from 'drizzle-orm'

// Delete a category with no products and no price history. Nothing here retires a category, so
// one with either stays; the refusal says why rather than raising the price table's own trigger
// (category_prices is append-only, 0010). Renaming was the only option before this route (#908).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await categoryById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  if (held.productCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has ${held.productCount} product${held.productCount === 1 ? '' : 's'} in it: move or delete them first`,
    })
  }

  const pricedRows = await db.all<{ priced: number }>(sql`SELECT count(*) AS priced FROM category_prices WHERE category_id = ${id}`)
  if ((pricedRows[0]?.priced ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has a price history, which is append-only, so it cannot be deleted: rename it instead`,
    })
  }

  await db.batch([
    db.delete(schema.barCategories).where(eq(schema.barCategories.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.category.deleted',
      target: `bar-category:${id}`,
      detail: { name: held.name },
    })),
  ])

  return { ok: true }
})
