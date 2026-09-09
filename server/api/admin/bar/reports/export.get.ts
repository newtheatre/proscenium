import { z } from 'zod'
import { toCsv } from '#server/utils/csv'
import { reportPeriodForm, REPORT_SECTIONS } from '#shared/utils/bar-reports'
import { formatLondon } from '#shared/utils/london'
import { saysMoney } from '#shared/utils/bar'

const query = reportPeriodForm.and(z.object({ section: z.enum(REPORT_SECTIONS) }))

// One CSV per section, guarded against formula injection by `toCsv` (criterion 2). Money is
// formatted here, at the point of display; the JSON report above stays integer pence (criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.read')
  const { section, ...period } = await getValidatedQueryOrThrow(event, query)
  const report = await barReport(period)

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.report.exported',
    target: null,
    detail: { section, fromAt: report.fromAt, toAt: report.toAt },
  }))

  const rows: Record<string, unknown>[] = (() => {
    switch (section) {
      case 'sales':
        return report.sales.map(row => ({
          category: row.categoryName, product: row.productName, variant: row.variantLabel,
          qty: row.qty, revenue: saysMoney(row.revenuePence),
        }))
      case 'gp':
        return report.gp.byItem.map(row => ({ item: row.itemName, qtyDepleted: row.qtyDepleted, cost: saysMoney(row.costPence) }))
      case 'variance':
        return report.variance.map(row => ({
          stocktake: row.stocktakeId, item: row.itemName,
          applied: formatLondon(new Date(row.appliedAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
          qtyVariance: row.qtyVariance, value: saysMoney(row.valuePence),
        }))
      case 'comps':
        return report.comps.map(row => ({
          when: formatLondon(new Date(row.happenedAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
          reason: row.reason ?? '', approvedBy: row.approvedByName, foregone: saysMoney(row.foregonePence),
        }))
      case 'discounts':
        return report.discounts.map(row => ({
          discount: row.discountName, percent: row.percent, timesApplied: row.timesApplied,
          discounted: saysMoney(row.discountedPence),
        }))
    }
  })()

  const csv = toCsv(rows)
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="bar-${section}-report.csv"`)
  return csv
})
