import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

/** GET /api/admin/bar/reports/variance: stocktake variance over time. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, querySchema.parse)
  const rows = await varianceOverTime(query.from, query.to)

  if (query.format === 'csv') {
    return sendCsv(event, `bar-variance-${query.from}-to-${query.to}.csv`, toCsv(
      ['stocktake', 'finished', 'product', 'variance (containers)', 'variance', 'reason'],
      rows.map(r => [r.stocktakeId, r.finishedAt, r.productName, r.varianceContainers.toFixed(3), formatQty(r, r.varianceQty), r.reason ?? '']),
    ))
  }

  return { rows }
})
