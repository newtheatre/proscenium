import { toCsv } from '#server/utils/csv'
import { SU_EXPORT_ROW_CAP, suExportCapRefusal, suExportCsvRows, suExportForm } from '#shared/utils/su-export'

// A period's ledger lines, categorised for the SU's own accounting (I-108). An open range
// exports anyway, marked rather than refused: x-period-status carries whether it is stable.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.export')
  const period = await getValidatedQueryOrThrow(event, suExportForm)
  const { fromDay, toDay } = await resolvePeriodBounds(period)

  const [rows, closed] = await Promise.all([
    suExportRows(fromDay, toDay),
    isRangeClosed(fromDay, toDay),
  ])
  if (rows.length > SU_EXPORT_ROW_CAP) throw createError({ statusCode: 400, statusMessage: suExportCapRefusal() })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'finance.exported',
    target: null,
    detail: { kind: period.kind, fromDay, toDay, rows: rows.length, closed },
  }))

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="su-export-${fromDay}-to-${toDay}.csv"`)
  setResponseHeader(event, 'x-period-status', closed ? 'closed' : 'open')
  return toCsv(suExportCsvRows(rows))
})
