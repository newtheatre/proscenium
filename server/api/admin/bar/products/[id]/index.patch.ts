import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  unit: z.enum(schema.PRODUCT_UNITS).optional(),
  containerMl: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
  stockOnly: z.boolean().optional(),
  stockProductId: z.string().trim().min(1).nullable().optional(),
  depletesQty: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  parQty: z.coerce.number().int().min(0).nullable().optional(),
  ageRestricted: z.boolean().optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
  status: z.enum(schema.PRODUCT_STATUSES).optional(),
})

/** PATCH /api/admin/bar/products/:id. Edit or retire. Prices have their own route. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const product = await db.select({
    id: schema.barProducts.id,
    containerMl: schema.barProducts.containerMl,
    stockProductId: schema.barProducts.stockProductId,
  }).from(schema.barProducts).where(eq(schema.barProducts.id, id)).get()
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product.' })

  if (input.stockProductId === id) {
    throw createError({ statusCode: 400, statusMessage: 'A product cannot deplete itself through a pointer. Leave it unset.' })
  }

  const stockProductId = input.stockProductId === undefined ? product.stockProductId : input.stockProductId
  if (input.stockOnly && stockProductId) {
    throw createError({ statusCode: 400, statusMessage: 'Something stock only holds its own stock. Clear what it is poured from first.' })
  }
  // A measure takes from its bottle, so its own container size means nothing.
  const containerMl = stockProductId
    ? null
    : input.containerMl === undefined ? product.containerMl : input.containerMl

  // Every movement is in the size that was current when it was written (ADR-0035).
  if (containerMl !== product.containerMl && await hasMovements(id)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This has stock movements against it, so its size is fixed. Retire it and add the new size as its own product.',
    })
  }

  let depletesQty = input.depletesQty === undefined ? undefined : input.depletesQty
  // One level only: a measure may not point at another measure (docs/13 §3.1).
  if (input.stockProductId) {
    const target = await db.select({
      stockProductId: schema.barProducts.stockProductId,
      containerMl: schema.barProducts.containerMl,
    }).from(schema.barProducts).where(eq(schema.barProducts.id, input.stockProductId)).get()
    if (!target) throw createError({ statusCode: 400, statusMessage: 'That stock product does not exist.' })
    if (target.stockProductId) {
      throw createError({ statusCode: 400, statusMessage: 'That product already draws from another. Point at the one that holds the stock.' })
    }
    depletesQty ??= containerSize(target)
  }
  if (input.stockProductId === null) depletesQty = null

  await db.update(schema.barProducts).set({ ...input, containerMl, depletesQty })
    .where(eq(schema.barProducts.id, id))
  return { ok: true }
})
