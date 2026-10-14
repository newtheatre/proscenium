import { z } from 'zod'
import { registerCountQuery, registerPageQuery } from '#server/utils/age-checks-export'
import { startOfLondonDayAfter } from '#shared/utils/london'
import type { AgeCheckExportRow } from '#server/utils/age-checks-export'

const query = pageQuery.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the first day'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the last day'),
})

// The register for any range, on screen, for whoever may export it (0136): the rows the export
// carries, superseded entries included, a page at a time. Reading is not audited; exporting is.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'age-checks.export')
  const { from, to, page, pageSize } = await getValidatedQueryOrThrow(event, query)
  if (from > to) throw createError({ statusCode: 422, statusMessage: 'Pick a range that starts before it ends' })

  const fromAt = Math.floor(startOfLondonDayAfter(from, 0).getTime() / 1000)
  const toAt = Math.floor(startOfLondonDayAfter(to, 1).getTime() / 1000)

  const [items, [totalRow]] = await Promise.all([
    db.all<AgeCheckExportRow>(registerPageQuery(fromAt, toAt, pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(registerCountQuery(fromAt, toAt)),
  ])

  return envelope(items, totalRow?.total ?? 0, page, pageSize)
})
