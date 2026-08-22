import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

/** GET /api/admin/bar/reports/comps: by reason, with requester and approver. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, querySchema.parse)
  const report = await compsIn(query.from, query.to)

  if (query.format === 'csv') {
    return sendCsv(event, `bar-comps-${query.from}-to-${query.to}.csv`, toCsv(
      ['night', 'what', 'reason', 'note', 'value', 'requested by', 'approved by'],
      report.rows.map(r => [r.night, r.what, r.reason, r.note, penceToPounds(r.grossPence), r.requestedBy, r.approvedBy]),
    ))
  }

  return report
})
