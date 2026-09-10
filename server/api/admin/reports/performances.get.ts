import { periodForm } from '#shared/utils/season-dashboard'
import { performanceReportFilter } from '#shared/utils/season-reports'

const query = periodForm.and(pageQuery).and(performanceReportFilter)

// Attendance versus sold, and staffing gaps, one row per performance (E-126 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reports.read')
  const { page, pageSize, venueId, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt } = periodBounds(period)

  const { items, total } = await performanceReports(fromAt, toAt, { venueId }, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
