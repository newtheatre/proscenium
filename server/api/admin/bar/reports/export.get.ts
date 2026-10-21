import { z } from 'zod'
import { toCsv } from '#server/utils/csv'
import { BAR_REPORT_COLUMNS, barReportFileName, csvPounds, csvWhen, reportPeriodForm, REPORT_EXPORT_PAGE_ROWS, REPORT_SECTIONS } from '#shared/utils/bar-reports'
import { says } from '#shared/utils/bar'

const query = reportPeriodForm.and(z.object({
  section: z.enum(REPORT_SECTIONS),
  page: z.coerce.number().int().positive().default(1),
}))

// One CSV per section, guarded against formula injection by `toCsv` (criterion 2). Money is a
// plain decimal and a moment an ISO London date, so a spreadsheet sums and sorts them (0128).

// The two unbounded sections export a page at a time and the file says which page of how many,
// so a season is never silently cut short (criterion 2). The rest are bounded and export whole.
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyPermission(event, ['bar.read', 'finance.read'])
  const { section, page, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt } = resolveReportPeriod(period)
  const paging = { page, pageSize: REPORT_EXPORT_PAGE_ROWS }
  const columns = BAR_REPORT_COLUMNS[section]
  // Each row's values in the declared column order, so the heading and the cells cannot drift.
  const rowOf = (values: unknown[]): Record<string, unknown> =>
    Object.fromEntries(columns.map((column, index) => [column, values[index]]))

  const exported = await (async (): Promise<{ rows: Record<string, unknown>[], pages: number }> => {
    switch (section) {
      case 'sales': {
        const rows = await salesReport(fromAt, toAt)
        return { rows: rows.map(row => rowOf([row.categoryName, row.productName, row.variantLabel, row.qty, csvPounds(row.revenuePence)])), pages: 1 }
      }
      case 'gp': {
        const gp = await grossProfitReport(fromAt, toAt)
        return { rows: gp.byItem.map(row => rowOf([row.itemName, says(row.unit), row.qtyDepleted, csvPounds(row.costPence)])), pages: 1 }
      }
      case 'variance': {
        const variance = await stocktakeVarianceReport(fromAt, toAt, paging)
        return { rows: variance.items.map(row => rowOf([
          csvWhen(row.openedAt), csvWhen(row.appliedAt), row.itemName, says(row.unit), row.qtyVariance, csvPounds(row.valuePence),
        ])), pages: variance.pages }
      }
      case 'comps': {
        const comps = await compsReport(fromAt, toAt, paging)
        return { rows: comps.items.map(row => rowOf([
          csvWhen(row.happenedAt), row.reason ?? '', row.approvedByName, csvPounds(row.foregonePence),
        ])), pages: comps.pages }
      }
      case 'wastage': {
        const rows = await wastageReport(fromAt, toAt)
        return { rows: rows.map(row => rowOf([
          says(row.reason), row.itemName, row.categoryName, says(row.unit), row.qtyWasted, csvPounds(row.costPence),
        ])), pages: 1 }
      }
      case 'discounts': {
        const rows = await discountsReport(fromAt, toAt)
        return { rows: rows.map(row => rowOf([row.discountName, row.percent, row.timesApplied, csvPounds(row.discountedPence)])), pages: 1 }
      }
    }
  })()

  // Recorded once the rows are in hand, so the trail never claims an export the reader never got.
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.report.exported',
    target: null,
    detail: { section, fromAt, toAt, page },
  }))

  const named = barReportFileName(section, period, { page, pages: exported.pages })
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${named}.csv"`)
  return toCsv(exported.rows, columns)
})
