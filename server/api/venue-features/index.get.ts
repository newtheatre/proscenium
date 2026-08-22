import { db, schema } from '@nuxthub/db'
import { count } from 'drizzle-orm'
import { listVenueFeatures } from '~~/shared/utils/abilities'

/** GET /api/venue-features: list venue features. Public. */
export default defineEventHandler(async (event) => {
  await authorize(event, listVenueFeatures)

  const { page, limit, q } = await getValidatedQuery(event, paginationSchema.parse)

  const where = q ? likeInsensitive(schema.venueFeatures.name, q) : undefined

  const [totalRow] = await db.select({ n: count() }).from(schema.venueFeatures).where(where)
  const total = totalRow?.n ?? 0

  const rows = await db.query.venueFeatures.findMany({
    where: () => where,
    orderBy: (venueFeatures, { asc }) => [asc(venueFeatures.name)],
    limit,
    offset: offsetFor({ page, limit }),
  })

  return paginated(rows, total, { page, limit })
})
