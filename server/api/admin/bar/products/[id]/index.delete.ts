import { eq } from 'drizzle-orm'

// Delete a product nothing has ever been sold under. One that has can only be retired, and the
// refusal says so (F-111 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await productById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  if (held.everSold) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has been sold, so it can only be retired: every line sold under it still has to resolve`,
    })
  }

  await db.batch([
    db.delete(schema.barProducts).where(eq(schema.barProducts.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.product.deleted',
      target: `bar-product:${id}`,
      detail: { name: held.name, categoryId: held.categoryId },
    })),
  ])

  return { ok: true }
})
