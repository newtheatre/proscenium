import { db, schema } from '@nuxthub/db'
import { and, asc, eq } from 'drizzle-orm'
import { TRAINING_PERFORMANCES } from '~~/shared/utils/trainingScenario'

/** GET /api/training/bar/tonight: the real menu, an invented night. */
export default defineEventHandler(async (event) => {
  await requireRun(event, 'bar-till')

  // The live catalogue, read-only: a trainee learns the actual menu at the
  // actual prices, which is half the point (docs/14 §4).
  const [products, discounts] = await Promise.all([
    db.select({
      id: schema.barProducts.id,
      categoryId: schema.barProducts.categoryId,
      categoryName: schema.barCategories.name,
      name: schema.barProducts.name,
      ageRestricted: schema.barProducts.ageRestricted,
      sort: schema.barProducts.sort,
    })
      .from(schema.barProducts)
      .innerJoin(schema.barCategories, eq(schema.barProducts.categoryId, schema.barCategories.id))
      .where(and(eq(schema.barProducts.status, 'ACTIVE'), eq(schema.barProducts.stockOnly, false)))
      .orderBy(asc(schema.barCategories.sort), asc(schema.barProducts.sort), asc(schema.barProducts.name)),
    db.select({ id: schema.barDiscounts.id, name: schema.barDiscounts.name, percent: schema.barDiscounts.percent })
      .from(schema.barDiscounts)
      .where(eq(schema.barDiscounts.status, 'ACTIVE'))
      .orderBy(asc(schema.barDiscounts.sort)),
  ])

  const prices = await currentPrices(products.map(product => product.id))

  return {
    night: 'practice',
    session: null,
    // Trained by definition: they are being taught it right now.
    alcoholTrained: true,
    trainingNeedsReview: false,
    performances: TRAINING_PERFORMANCES,
    discounts,
    products: products
      .filter(product => prices.has(product.id))
      .map(product => ({ ...product, pricePence: prices.get(product.id)!.pricePence })),
  }
})
