import { db, schema } from '@nuxthub/db'
import { and, asc, eq } from 'drizzle-orm'
import { runBarTab } from '~~/shared/utils/abilities'

/** GET /api/bar/tabs/menu, what you may put on a tab and what you owe. */
export default defineEventHandler(async (event) => {
  await authorize(event, runBarTab)

  const { user } = await requireUserSession(event)

  // Alcohol needs a trained server and a Challenge 25 check, so it is not
  // offered here at all (ADR-0030).
  const products = await db.select({
    id: schema.barProducts.id,
    categoryId: schema.barProducts.categoryId,
    categoryName: schema.barCategories.name,
    name: schema.barProducts.name,
    sort: schema.barProducts.sort,
  })
    .from(schema.barProducts)
    .innerJoin(schema.barCategories, eq(schema.barProducts.categoryId, schema.barCategories.id))
    .where(and(
      eq(schema.barProducts.status, 'ACTIVE'),
      eq(schema.barProducts.ageRestricted, false),
    ))
    .orderBy(asc(schema.barCategories.sort), asc(schema.barProducts.sort), asc(schema.barProducts.name))

  const [prices, outstandingPence] = await Promise.all([
    currentPrices(products.map(product => product.id)),
    outstandingFor(user.id),
  ])

  return {
    outstandingPence,
    softCapPence: TAB_SOFT_CAP_PENCE,
    // A product with no price cannot be sold, so it is not offered.
    products: products
      .filter(product => prices.has(product.id))
      .map(product => ({ ...product, pricePence: prices.get(product.id)!.pricePence })),
  }
})
