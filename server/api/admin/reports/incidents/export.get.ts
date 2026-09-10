import { toCsv } from '#server/utils/csv'
import { saysCategory, saysSeverity } from '#shared/utils/incidents'
import { periodForm } from '#shared/utils/season-dashboard'
import { incidentTrendFilter } from '#shared/utils/season-reports'

const query = periodForm.and(incidentTrendFilter)

// The trend breakdown as a spreadsheet (E-126 criterion 2), the formula-injection guard toCsv
// already carries (D-129). Audited the same way the licensing register's own export is.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'reports.read')
  const { category, severity, venueId, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt, fromDay, toDay } = periodBounds(period)

  const rows = await incidentTrendsExport(fromAt, toAt, { category, severity, venueId })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'reports.exported',
    target: null,
    detail: { report: 'incidents', fromDay, toDay, rows: rows.length },
  }))

  const csv = toCsv(rows.map(row => ({
    venue: row.venueName,
    category: saysCategory(row.category),
    severity: saysSeverity(row.severity),
    count: row.count,
  })))
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="incident-trends-${fromDay}-to-${toDay}.csv"`)
  return csv
})
