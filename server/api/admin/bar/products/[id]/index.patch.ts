import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  unit: z.enum(schema.PRODUCT_UNITS).optional(),
  stockProductId: z.string().trim().min(1).nullable().optional(),
  depletesMilli: z.coerce.number().int().min(1).max(1_000_000).optional(),
  parMilli: z.coerce.number().int().min(0).nullable().optional(),
  ageRestricted: z.boolean().optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
  status: z.enum(schema.PRODUCT_STATUSES).optional(),
})

/** PATCH /api/admin/bar/products/:id. Edit or retire. Prices have their own route. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const product = await db.select({ id: schema.barProducts.id })
    .from(schema.barProducts).where(eq(schema.barProducts.id, id)).get()
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product.' })

  if (input.stockProductId === id) {
    throw createError({ statusCode: 400, statusMessage: 'A product cannot deplete itself through a pointer. Leave it unset.' })
  }
  // One level only: a measure may not point at another measure (docs/13 §3.1).
  if (input.stockProductId) {
    const target = await db.select({ stockProductId: schema.barProducts.stockProductId })
      .from(schema.barProducts).where(eq(schema.barProducts.id, input.stockProductId)).get()
    if (!target) throw createError({ statusCode: 400, statusMessage: 'That stock product does not exist.' })
    if (target.stockProductId) {
      throw createError({ statusCode: 400, statusMessage: 'That product already draws from another. Point at the one that holds the stock.' })
    }
  }

  await db.update(schema.barProducts).set(input).where(eq(schema.barProducts.id, id))
  return { ok: true }
})
