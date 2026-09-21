import { eq } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'

// Delete a product nothing has ever been sold under, and nothing has priced. One that has can
// only be retired, because a variant's price history is append-only (F-111 criterion 3, 0010).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await productById(id)
  if (!held) throw noSuch('product')

  if (held.everSold) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has been sold, so it can only be retired: every line sold under it still has to resolve`,
    })
  }

  // Cascading deletes reach `variant_prices`, which is append-only and trigger-enforced; refusing
  // here gives a readable message instead of the trigger's raw error (0010, 0047).
  const variants = await variantsOf(id, londonDayOf(new Date()))
  const blocked = variants.find(variant => variant.everPriced || variant.everSold)
  if (blocked) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has a serving size with ${blocked.everSold ? 'sales' : 'a price history'} against it, so it can only be retired: every line still has to resolve`,
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
