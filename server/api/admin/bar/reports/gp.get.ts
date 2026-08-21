import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({ format: z.enum(['json', 'csv']).optional().default('json') })

/** GET /api/admin/bar/reports/gp — margin per product at the latest cost. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, querySchema.parse)
  const rows = await grossProfit()

  if (query.format === 'csv') {
    return sendCsv(event, `bar-gp-${londonDate()}.csv`, toCsv(
      ['product', 'price', 'cost', 'margin', 'gp %'],
      rows.map(r => [r.name, penceToPounds(r.pricePence), penceToPounds(r.costPence), penceToPounds(r.marginPence), r.gpPercent]),
    ))
  }

  return { rows }
})
