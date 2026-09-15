import { z } from 'zod'
import { toCsv } from '#server/utils/csv'
import { reportPeriodForm, REPORT_EXPORT_PAGE_ROWS, REPORT_SECTIONS } from '#shared/utils/bar-reports'
import { formatLondon } from '#shared/utils/london'
import { saysMoney } from '#shared/utils/bar'

const query = reportPeriodForm.and(z.object({
  section: z.enum(REPORT_SECTIONS),
  page: z.coerce.number().int().positive().default(1),
}))

// One CSV per section, guarded against formula injection by `toCsv` (criterion 2). Money is
// formatted here, at the point of display; the JSON report stays integer pence (criterion 3).

// The two unbounded sections export a page at a time and the file says which page of how many,
// so a season is never silently cut short (criterion 2). The rest are bounded and export whole.
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyPermission(event, ['bar.read', 'finance.read'])
  const { section, page, ...period } = await getValidatedQueryOrThrow(event, query)
  const { fromAt, toAt } = resolveReportPeriod(period)
  const paging = { page, pageSize: REPORT_EXPORT_PAGE_ROWS }

  const exported = await (async (): Promise<{ rows: Record<string, unknown>[], pages: number }> => {
    switch (section) {
      case 'sales': {
        const rows = await salesReport(fromAt, toAt)
        return { rows: rows.map(row => ({
          category: row.categoryName, product: row.productName, variant: row.variantLabel,
          qty: row.qty, revenue: saysMoney(row.revenuePence),
        })), pages: 1 }
      }
      case 'gp': {
        const gp = await grossProfitReport(fromAt, toAt)
        return { rows: gp.byItem.map(row => ({ item: row.itemName, qtyDepleted: row.qtyDepleted, cost: saysMoney(row.costPence) })), pages: 1 }
      }
      case 'variance': {
        const variance = await stocktakeVarianceReport(fromAt, toAt, paging)
        return { rows: variance.items.map(row => ({
          stocktake: row.stocktakeId, item: row.itemName,
          applied: formatLondon(new Date(row.appliedAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
          qtyVariance: row.qtyVariance, value: saysMoney(row.valuePence),
        })), pages: variance.pages }
      }
      case 'comps': {
        const comps = await compsReport(fromAt, toAt, paging)
        return { rows: comps.items.map(row => ({
          when: formatLondon(new Date(row.happenedAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
          reason: row.reason ?? '', approvedBy: row.approvedByName, foregone: saysMoney(row.foregonePence),
        })), pages: comps.pages }
      }
      case 'discounts': {
        const rows = await discountsReport(fromAt, toAt)
        return { rows: rows.map(row => ({
          discount: row.discountName, percent: row.percent, timesApplied: row.timesApplied,
          discounted: saysMoney(row.discountedPence),
        })), pages: 1 }
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

  const named = exported.pages > 1 ? `bar-${section}-report-page-${page}-of-${exported.pages}` : `bar-${section}-report`
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${named}.csv"`)
  return toCsv(exported.rows)
})
