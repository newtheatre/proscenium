import { db, schema } from '@nuxthub/db'
import { asc, count, eq } from 'drizzle-orm'
import { listPassTypes } from '~~/shared/utils/abilities'

/**
 * GET /api/pass-types: list pass products with their prices, scope size and
 * how many passes have been issued. Staff only.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listPassTypes)

  const types = await db
    .select({
      id: schema.passTypes.id,
      name: schema.passTypes.name,
      slug: schema.passTypes.slug,
      description: schema.passTypes.description,
      status: schema.passTypes.status,
      seasonId: schema.passTypes.seasonId,
      seasonName: schema.seasons.name,
      validFrom: schema.passTypes.validFrom,
      validTo: schema.passTypes.validTo,
      maxIssued: schema.passTypes.maxIssued,
      transferable: schema.passTypes.transferable,
    })
    .from(schema.passTypes)
    .leftJoin(schema.seasons, eq(schema.passTypes.seasonId, schema.seasons.id))
    .orderBy(asc(schema.passTypes.name))

  if (types.length === 0) return []

  // Counts in SQL rather than by loading the rows: there can be thousands of
  // issued passes and this list is a summary.
  const [prices, scope, issued] = await Promise.all([
    db.select({
      id: schema.passTypePrices.id,
      passTypeId: schema.passTypePrices.passTypeId,
      label: schema.passTypePrices.label,
      price: schema.passTypePrices.price,
      active: schema.passTypePrices.active,
      sort: schema.passTypePrices.sort,
    }).from(schema.passTypePrices).orderBy(asc(schema.passTypePrices.sort)),
    db.select({ passTypeId: schema.passTypeShows.passTypeId, n: count() })
      .from(schema.passTypeShows).groupBy(schema.passTypeShows.passTypeId),
    db.select({ passTypeId: schema.passes.passTypeId, n: count() })
      .from(schema.passes).where(eq(schema.passes.status, 'ACTIVE'))
      .groupBy(schema.passes.passTypeId),
  ])

  const scopeBy = new Map(scope.map(s => [s.passTypeId, s.n]))
  const issuedBy = new Map(issued.map(s => [s.passTypeId, s.n]))

  return types.map(t => ({
    ...t,
    prices: prices.filter(p => p.passTypeId === t.id),
    showCount: scopeBy.get(t.id) ?? 0,
    issuedCount: issuedBy.get(t.id) ?? 0,
  }))
})
