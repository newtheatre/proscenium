import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, isNull, lte, ne } from 'drizzle-orm'
import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/bar/tonight: the till's opening state: session, products, prices. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)

  const [session, performances, products, discounts] = await Promise.all([
    db.select().from(schema.barSessions)
      .where(and(eq(schema.barSessions.night, night), isNull(schema.barSessions.closedAt))).get(),
    db.select({
      id: schema.performances.id,
      startsAt: schema.performances.startsAt,
      showTitle: schema.shows.title,
      venueName: schema.venues.name,
    })
      .from(schema.performances)
      .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
      .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
      .where(and(
        gte(schema.performances.startsAt, validityStart(night)),
        lte(schema.performances.startsAt, validityEnd(night)),
        ne(schema.performances.status, 'CANCELLED'),
      ))
      .orderBy(asc(schema.performances.startsAt)),
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

  const prices = await currentPrices(products.map(p => p.id))

  // Soft gate: the till warns and still sells (docs/13 §5, §8).
  const training = await isEligible(user.id, 'bar')

  return {
    night,
    session: session ?? null,
    alcoholTrained: training.eligible,
    trainingNeedsReview: training.needsReview,
    performances,
    discounts,
    // A product with no price cannot be sold, so it is not offered.
    products: products
      .filter(product => prices.has(product.id))
      .map(product => ({ ...product, pricePence: prices.get(product.id)!.pricePence })),
  }
})
