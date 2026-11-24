// The sales report for one production as CSV (Box office specification, part 6, "Sales report"):
// one row per performance, ticket type, channel and state.
import { z } from 'zod'
import { getQuery } from 'nuxt/server'
import { defineRoute } from '#kit'
import { SALES_COLUMNS, salesRows, toCsv } from '../../../reports'

export default defineRoute({
  ability: 'box-office.report.export',
  record: event => ['core.production', String(getQuery(event).productionId ?? '') || undefined],
  rateLimit: 'export',
  input: z.object({ productionId: z.string().min(1).max(64) }), // not-policy: shape bound
}, async (event, { input }) => {
  event.res.headers.set('content-type', 'text/csv; charset=utf-8')
  event.res.headers.set('content-disposition', `attachment; filename="sales-${input.productionId}.csv"`)
  return toCsv(await salesRows(input.productionId), SALES_COLUMNS)
})
