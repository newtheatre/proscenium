import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  categoryId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  unit: z.enum(schema.PRODUCT_UNITS).optional().default('each'),
  /** Omit to point at itself: a bottled beer depletes one of itself. */
  stockProductId: z.string().trim().min(1).nullable().optional(),
  depletesMilli: z.coerce.number().int().min(1).max(1_000_000).optional().default(1000),
  parMilli: z.coerce.number().int().min(0).nullable().optional(),
  ageRestricted: z.boolean().optional().default(true),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
  /** Pence. Creates the first date-effective price alongside the product. */
  pricePence: z.coerce.number().int().min(0).max(100_000),
})

/** POST /api/admin/bar/products — add something to sell, with its first price. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  if (input.stockProductId) {
    const target = await db.select({ id: schema.barProducts.id, stockProductId: schema.barProducts.stockProductId })
      .from(schema.barProducts).where(eq(schema.barProducts.id, input.stockProductId)).get()
    if (!target) throw createError({ statusCode: 404, statusMessage: 'That stock product does not exist' })
    // One level only: a bundle of bundles is a different design (docs/13 §3.1).
    if (target.stockProductId && target.stockProductId !== target.id) {
      throw createError({ statusCode: 409, statusMessage: 'That product already depletes another. Point at the thing actually stocked.' })
    }
  }

  const { pricePence, ...product } = input
  const [row] = await db.insert(schema.barProducts).values(product).returning()

  await db.insert(schema.barPrices).values({
    productId: row!.id,
    pricePence,
    effectiveFrom: pricingDate(),
    createdByUserId: user.id,
  })

  return { ...row, pricePence }
})
