import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, lte, or, isNull } from 'drizzle-orm'

/**
 * GET /api/pass-types/on-sale — what a member may ask for. Public, because a
 * requester cannot ask for something they cannot see (ADR-0028).
 */
export default defineEventHandler(async () => {
  const now = new Date()

  // Column allow-listed: internal notes and the show list stay staff-side.
  const types = await db.select({
    id: schema.passTypes.id,
    name: schema.passTypes.name,
    slug: schema.passTypes.slug,
    description: schema.passTypes.description,
    validFrom: schema.passTypes.validFrom,
    validTo: schema.passTypes.validTo,
  })
    .from(schema.passTypes)
    .where(and(
      eq(schema.passTypes.status, 'ON_SALE'),
      or(isNull(schema.passTypes.salesOpenAt), lte(schema.passTypes.salesOpenAt, now)),
      or(isNull(schema.passTypes.salesCloseAt), gt(schema.passTypes.salesCloseAt, now)),
      gt(schema.passTypes.validTo, now),
    ))
    .orderBy(asc(schema.passTypes.name))

  if (!types.length) return { passTypes: [] }

  // Scoped by the on-sale predicate, not by an id list (ADR-0006).
  const prices = await db.select({
    passTypeId: schema.passTypePrices.passTypeId,
    id: schema.passTypePrices.id,
    label: schema.passTypePrices.label,
    price: schema.passTypePrices.price,
  })
    .from(schema.passTypePrices)
    .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passTypePrices.passTypeId))
    .where(and(eq(schema.passTypePrices.active, true), eq(schema.passTypes.status, 'ON_SALE')))
    .orderBy(asc(schema.passTypePrices.sort))

  const covered = await db.select({
    passTypeId: schema.passTypeShows.passTypeId,
    title: schema.shows.title,
    slug: schema.shows.slug,
  })
    .from(schema.passTypeShows)
    .innerJoin(schema.shows, eq(schema.shows.id, schema.passTypeShows.showId))
    .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passTypeShows.passTypeId))
    .where(eq(schema.passTypes.status, 'ON_SALE'))
    .orderBy(asc(schema.shows.title))

  return {
    passTypes: types.map(type => ({
      ...type,
      prices: prices.filter(p => p.passTypeId === type.id).map(({ id, label, price }) => ({ id, label, price })),
      shows: covered.filter(c => c.passTypeId === type.id).map(({ title, slug }) => ({ title, slug })),
    })),
  }
})
