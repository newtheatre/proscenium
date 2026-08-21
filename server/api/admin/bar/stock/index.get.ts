import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/stock — on-hand, par flags and value, all derived. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const [products, categories, onHand, costs] = await Promise.all([
    db.select({
      id: schema.barProducts.id,
      categoryId: schema.barProducts.categoryId,
      name: schema.barProducts.name,
      unit: schema.barProducts.unit,
      stockProductId: schema.barProducts.stockProductId,
      depletesMilli: schema.barProducts.depletesMilli,
      parMilli: schema.barProducts.parMilli,
      status: schema.barProducts.status,
    }).from(schema.barProducts).orderBy(asc(schema.barProducts.sort), asc(schema.barProducts.name)),
    db.select().from(schema.barCategories).orderBy(asc(schema.barCategories.sort)),
    onHandByProduct(),
    latestCostByProduct(),
  ])

  // Only what stock is held against: a 175ml measure is counted as its bottle.
  const depleted = new Set(products.map(p => p.stockProductId).filter(Boolean) as string[])
  const rows = products
    .filter(p => (!p.stockProductId || depleted.has(p.id)) && p.status !== 'RETIRED')
    .map((p) => {
      const milli = onHand.get(p.id) ?? 0
      const cost = costs.get(p.id) ?? null
      return {
        ...p,
        onHandMilli: milli,
        onHandUnits: milli / 1000,
        lastCostPence: cost,
        valuePence: cost == null ? null : Math.round((milli / 1000) * cost),
        belowPar: p.parMilli != null && milli < p.parMilli,
      }
    })

  const lastDelivery = await db.select({
    id: schema.stockDeliveries.id,
    supplier: schema.stockDeliveries.supplier,
    deliveredOn: schema.stockDeliveries.deliveredOn,
  }).from(schema.stockDeliveries).orderBy(asc(schema.stockDeliveries.deliveredOn)).limit(1).get()

  return {
    rows,
    categories,
    stockAtCostPence: rows.reduce((sum, r) => sum + (r.valuePence ?? 0), 0),
    belowParCount: rows.filter(r => r.belowPar).length,
    lastDelivery: lastDelivery ?? null,
    openStocktake: await db.select({ id: schema.stocktakes.id, startedAt: schema.stocktakes.startedAt })
      .from(schema.stocktakes).where(eq(schema.stocktakes.status, 'OPEN')).get() ?? null,
  }
})
