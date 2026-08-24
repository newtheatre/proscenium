import { db } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  productId: z.string().trim().min(1),
  /** Whole containers, signed: wastage is negative. */
  qtyContainers: z.coerce.number().refine(n => n !== 0, 'Nothing to adjust.').min(-100_000).max(100_000),
  kind: z.enum(['WASTAGE', 'TRANSFER', 'ADJUST']),
  reason: z.string().trim().min(1).max(200),
})

/** POST /api/admin/bar/stock/adjust: wastage, transfers and corrections. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const rules = await depletionRules()
  const product = rules.get(input.productId)
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product.' })
  if (!isStockProduct(product)) {
    throw createError({ statusCode: 400, statusMessage: 'Adjust the stock product, not something poured from it.' })
  }

  await db.batch(movementStatements([{
    productId: input.productId,
    qty: containersToQty(product, input.qtyContainers),
    kind: input.kind,
    reason: input.reason,
    createdByUserId: user.id,
  }]) as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return { ok: true }
})
