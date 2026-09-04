import { eq } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'

// Delete a serving size nothing has been sold as and nothing has priced. One with a price history
// can only be retired, because the history is append-only (F-112 criterion 5, 0010).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  if (held.everSold) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.label} has been sold, so it can only be retired: every line sold as it still has to resolve`,
    })
  }

  if (held.everPriced) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.label} has a price history, which is append-only, so it can only be retired`,
    })
  }

  await db.batch([
    db.delete(schema.productVariants).where(eq(schema.productVariants.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.variant.deleted',
      target: `bar-variant:${id}`,
      detail: { productId: held.productId, servingKind: held.servingKind, label: held.label },
    })),
  ])

  return { ok: true }
})
