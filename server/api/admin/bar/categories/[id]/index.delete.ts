import { eq } from 'drizzle-orm'

// Delete a category with no products and no price history; one with either stays. The refusal
// says why, rather than raising the price table's own append-only trigger (0010).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await categoryById(id)
  if (!held) throw noSuch('category')

  if (held.productCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has ${held.productCount} product${held.productCount === 1 ? '' : 's'} in it: move or delete them first`,
    })
  }

  if (held.hasPriceHistory) {
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
