import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = paginationSchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupBy: z.enum(['product', 'category', 'performance', 'month']).optional().default('product'),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

/** GET /api/admin/bar/reports/sales: sales by product, category, show or month. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, querySchema.parse)
  // A CSV of one page is not an export, so the whole range goes in the file.
  const limit = query.format === 'csv' ? 5000 : query.limit
  const offset = query.format === 'csv' ? 0 : offsetFor(query)

  const { rows, total } = await salesBy(query.groupBy, query.from, query.to, limit, offset)

  if (query.format === 'csv') {
    return sendCsv(event, `bar-sales-${query.groupBy}-${query.from}-to-${query.to}.csv`, toCsv(
      [query.groupBy, 'quantity', 'gross', 'card', 'tab', 'comp'],
      rows.map(r => [r.label, r.qty, penceToPounds(r.grossPence), penceToPounds(r.cardPence), penceToPounds(r.tabPence), penceToPounds(r.compPence)]),
    ))
  }

  return paginated(rows, total, query)
})
