import { toCsv } from '#server/utils/csv'
import { describeKind } from '#shared/utils/ledger'
import { exportRangeForm, formatPoundsForExport, SU_EXPORT_ROW_CAP } from '#shared/utils/su-export'

// A period's ledger lines, categorised for the SU's own accounting (I-108). An open range
// exports anyway, marked rather than refused: x-period-status carries whether it is stable.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.export')
  const input = await getValidatedQueryOrThrow(event, exportRangeForm)

  const [rows, closed] = await Promise.all([
    suExportRows(input.fromDay, input.toDay),
    isRangeClosed(input.fromDay, input.toDay),
  ])
  if (rows.length > SU_EXPORT_ROW_CAP) {
    throw createError({
      statusCode: 400,
      statusMessage: `This export would return more than ${new Intl.NumberFormat('en-GB').format(SU_EXPORT_ROW_CAP)} `
        + 'rows. Narrow the date range and try again.',
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'finance.exported',
    target: null,
    detail: { fromDay: input.fromDay, toDay: input.toDay, rows: rows.length, closed },
  }))

  const csv = toCsv(rows.map(row => ({
    date: row.londonDay,
    category: describeKind(row.kind),
    // The explicit unmapped line criterion 3 asks for, rather than a blank cell a spreadsheet
    // would silently sort past.
    nominalCode: row.nominalCode ?? 'UNMAPPED',
    amountPence: row.amountPence,
    amountPounds: formatPoundsForExport(row.amountPence),
  })))

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="su-export-${input.fromDay}-to-${input.toDay}.csv"`)
  setResponseHeader(event, 'x-period-status', closed ? 'closed' : 'open')
  return csv
})
