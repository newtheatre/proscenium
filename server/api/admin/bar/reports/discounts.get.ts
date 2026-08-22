import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

/** GET /api/admin/bar/reports/discounts: by type, and by who rang it up. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, querySchema.parse)
  const report = await discountsIn(query.from, query.to)

  if (query.format === 'csv') {
    return sendCsv(event, `bar-discounts-${query.from}-to-${query.to}.csv`, toCsv(
      ['grouping', 'name', 'uses', 'given away'],
      [
        ...report.byType.map(r => ['discount', r.label, r.uses, penceToPounds(r.pence)]),
        ...report.byStaff.map(r => ['staff', r.label, r.uses, penceToPounds(r.pence)]),
      ],
    ))
  }

  return report
})
