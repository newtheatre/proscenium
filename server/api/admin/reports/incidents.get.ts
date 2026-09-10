import { periodForm } from '#shared/utils/season-dashboard'
import { incidentTrendFilter } from '#shared/utils/season-reports'

const query = periodForm.and(pageQuery).and(incidentTrendFilter)

// Incident and near-miss trends, grouped by category, severity and venue (E-126 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reports.read')
  const { page, pageSize, category, severity, venueId, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt } = periodBounds(period)

  const { items, total } = await incidentTrends(fromAt, toAt, { category, severity, venueId }, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
