import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  pricePence: z.coerce.number().int().min(0).max(100_000),
  /** `YYYY-MM-DD`. Defaults to today; a future date is how you plan a change. */
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * POST /api/admin/bar/products/:id/prices — set a price from a date. Append
 * only: nothing is updated, so the history is the audit trail (docs/13 §3).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const productId = getRouterParam(event, 'id')
  if (!productId) throw createError({ statusCode: 400, statusMessage: 'Product ID is required' })

  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const product = await db.select({ id: schema.barProducts.id }).from(schema.barProducts)
    .where(eq(schema.barProducts.id, productId)).get()
  if (!product) throw createError({ statusCode: 404, statusMessage: 'Product not found' })

  const [row] = await db.insert(schema.barPrices).values({
    productId,
    pricePence: input.pricePence,
    effectiveFrom: input.effectiveFrom ?? pricingDate(),
    createdByUserId: user.id,
  }).onConflictDoUpdate({
    target: [schema.barPrices.productId, schema.barPrices.effectiveFrom],
    set: { pricePence: input.pricePence, createdByUserId: user.id },
  }).returning()

  return row
})
