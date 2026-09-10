import { toCsv } from '#server/utils/csv'
import { formatLondon } from '#shared/utils/london'
import { periodForm } from '#shared/utils/season-dashboard'
import { performanceReportFilter } from '#shared/utils/season-reports'

const query = periodForm.and(performanceReportFilter)

// Attendance and staffing, one row per performance, as a spreadsheet (E-126 criteria 1, 2).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'reports.read')
  const { venueId, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt, fromDay, toDay } = periodBounds(period)

  const rows = await performanceReportsExport(fromAt, toAt, { venueId })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'reports.exported',
    target: null,
    detail: { report: 'performances', fromDay, toDay, rows: rows.length },
  }))

  const csv = toCsv(rows.map(row => ({
    when: formatLondon(new Date(row.startsAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
    venue: row.venueName,
    show: row.showTitle,
    sold: row.sold,
    admitted: row.admitted,
    noShows: row.noShows,
    unfilledSlots: row.unfilledSlots,
    officerBypass: row.officerBypass ? 'Yes' : 'No',
    autoClosed: row.autoClosed ? 'Yes' : 'No',
  })))
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="performance-report-${fromDay}-to-${toDay}.csv"`)
  return csv
})
