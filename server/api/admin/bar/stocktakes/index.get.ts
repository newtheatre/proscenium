import { sql } from 'drizzle-orm'
import { pageQuery } from '#shared/utils/pagination'
import type { Stocktake } from '#shared/utils/stocktakes'

// Every stocktake, newest first: the history a mistake is corrected against with a new one
// rather than an edit (F-115 criterion 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const total = Number((await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM stocktakes`))[0]?.total ?? 0)
  const items = await db.all<Stocktake>(sql`
    SELECT id AS id, status AS status, opened_by AS openedBy, opened_at AS openedAt,
           applied_by AS appliedBy, applied_at AS appliedAt
    FROM stocktakes ORDER BY opened_at DESC LIMIT ${pageSize} OFFSET ${offsetFor(page, pageSize)}
  `)

  return envelope(items, total, page, pageSize)
})
