import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/stocktakes/:id — the count sheet and its variance. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const id = getRouterParam(event, 'id')!

  const stocktake = await db.select().from(schema.stocktakes).where(eq(schema.stocktakes.id, id)).get()
  if (!stocktake) throw createError({ statusCode: 404, statusMessage: 'No such stocktake.' })

  const lines = await db.select({
    id: schema.stocktakeLines.id,
    productId: schema.stocktakeLines.productId,
    name: schema.barProducts.name,
    unit: schema.barProducts.unit,
    expectedMilli: schema.stocktakeLines.expectedMilli,
    countedMilli: schema.stocktakeLines.countedMilli,
    reason: schema.stocktakeLines.reason,
  })
    .from(schema.stocktakeLines)
    .innerJoin(schema.barProducts, eq(schema.barProducts.id, schema.stocktakeLines.productId))
    .where(eq(schema.stocktakeLines.stocktakeId, id))
    .orderBy(asc(schema.barProducts.sort), asc(schema.barProducts.name))

  return {
    ...stocktake,
    lines: lines.map(l => ({
      ...l,
      varianceMilli: l.countedMilli == null ? null : l.countedMilli - l.expectedMilli,
    })),
    countedLines: lines.filter(l => l.countedMilli != null).length,
  }
})
