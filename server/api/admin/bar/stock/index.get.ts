import { db, schema } from '@nuxthub/db'
import { asc, desc, eq } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/stock: on-hand, par flags and value, all derived. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const [products, categories, onHand, costs] = await Promise.all([
    db.select({
      id: schema.barProducts.id,
      categoryId: schema.barProducts.categoryId,
      name: schema.barProducts.name,
      unit: schema.barProducts.unit,
      containerMl: schema.barProducts.containerMl,
      stockOnly: schema.barProducts.stockOnly,
      stockProductId: schema.barProducts.stockProductId,
      depletesQty: schema.barProducts.depletesQty,
      parQty: schema.barProducts.parQty,
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
      const qty = onHand.get(p.id) ?? 0
      const containers = qtyToContainers(p, qty)
      const cost = costs.get(p.id) ?? null
      return {
        ...p,
        onHandQty: qty,
        onHandContainers: containers,
        lastCostPence: cost,
        valuePence: cost == null ? null : Math.round(containers * cost),
        belowPar: p.parQty != null && qty < p.parQty,
      }
    })

  const lastDelivery = await db.select({
    id: schema.stockDeliveries.id,
    supplier: schema.stockDeliveries.supplier,
    deliveredOn: schema.stockDeliveries.deliveredOn,
  }).from(schema.stockDeliveries).orderBy(desc(schema.stockDeliveries.deliveredOn)).limit(1).get()

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
