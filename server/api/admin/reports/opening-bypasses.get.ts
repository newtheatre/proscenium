import { periodForm } from '#shared/utils/season-dashboard'
import { performanceReportFilter } from '#shared/utils/season-reports'

const query = periodForm.and(performanceReportFilter)

// Officer bypasses at a venue with no performance, which no night report carries (E-130 criterion 6).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reports.read')
  const { venueId, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromDay, toDay } = await resolvePeriodBounds(period)

  return openingBypasses(fromDay, toDay, { venueId })
})
