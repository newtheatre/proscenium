import { londonDayOf } from '#shared/utils/ledger'
import { toCsv } from '#server/utils/csv'

// The same shortfalls as CSV, for sending to a supplier (F-120 criterion 3).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const rows = await shortfalls()

  const csv = toCsv(rows.map(row => ({
    category: row.category ?? 'Uncategorised',
    item: row.name,
    onHand: row.onHand,
    par: row.parQty,
    shortfall: row.shortfall,
  })))

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="order-list-${londonDayOf(new Date())}.csv"`)
  return csv
})
