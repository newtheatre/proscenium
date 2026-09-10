import { z } from 'zod'
import { periodForm } from '#shared/utils/season-dashboard'
import { ENTRY_SOURCES } from '#shared/utils/ledger'

const query = periodForm.and(pageQuery).and(z.object({ source: z.enum(ENTRY_SOURCES).optional() }))

// Any figure on the dashboard drills down to its ledger entries (criterion 3), paged in SQL and
// never a bare array; treasurer and administrators only, never the committee's summary view.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const { page, pageSize, source, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt } = periodBounds(period)

  const { items, total } = await seasonEntries(fromAt, toAt, source, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
