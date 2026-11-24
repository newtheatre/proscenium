// The ledger as CSV for an accounting package (FIN-05): one row per entry of every sealed posting
// that happened between two local dates, inclusive, with account codes.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { EXPORT_COLUMNS, exportRows, rangeOf, toCsv } from '../../reports'

export default defineRoute({
  ability: 'finance.ledger.export',
  rateLimit: 'export',
  input: z.object({ from: z.iso.date(), to: z.iso.date() }),
}, async (event, { input }) => {
  if (input.to < input.from) refuse('finance.export.backwards', 'The last day is before the first.', { status: 422, fields: { to: 'finance.export.backwards' } })
  const rows = await exportRows(await rangeOf(input.from, input.to))
  event.res.headers.set('content-type', 'text/csv; charset=utf-8')
  event.res.headers.set('content-disposition', `attachment; filename="ledger-${input.from}-to-${input.to}.csv"`)
  return toCsv(rows, EXPORT_COLUMNS)
})
