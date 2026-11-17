// The bar's part of a payment (tab 3, "One payment for drinks"; tab 4). When the money arrives the
// bar sale is paid in Payments' own batch, and its income is returned by category: to the category's
// own income account where it names one, otherwise to bar.income, each with the opening's production
// and performance. When the payment ends without the money, the sale is open again with its lines.
import { all, first, nowMs, refuse, type UnitView } from '#kit'
import type { OwnerEntry, Part, Settlement } from '#modules/payments'

const INCOME = { key: 'bar.income' }
const NOT_WAITING = { code: 'bar.sale.not-waiting', reason: 'This bar sale is no longer waiting for this payment.' }

interface SaleRow { id: string, state: string, intent_id: string | null, total_minor: number, opening_id: string, performance_id: string | null, production_id: string | null }

const saleFor = (part: Part) => first<SaleRow>(
  `SELECT s.id, s.state, s.intent_id, s.total_minor, s.opening_id, o.performance_id, p.production_id
     FROM bar_sales s JOIN bar_openings o ON o.id = s.opening_id LEFT JOIN core_performances p ON p.id = o.performance_id WHERE s.id = ?`,
  part.record,
)

/** The sale's income by account, as credits, or as debits for a refund. */
async function income(sale: SaleRow, amountMinor: number, sign: 1 | -1): Promise<OwnerEntry[]> {
  const where = { productionId: sale.production_id, performanceId: sale.performance_id }
  if (sign === 1) return [{ account: INCOME, amountMinor, ...where }]
  const rows = await all<{ account: string | null, amount: number }>(
    `SELECT c.income_account_id AS account, sum(l.amount_minor) AS amount FROM bar_sale_lines l
       JOIN bar_variants v ON v.id = l.variant_id JOIN bar_products p ON p.id = v.product_id JOIN bar_categories c ON c.id = p.category_id
      WHERE l.sale_id = ? GROUP BY c.income_account_id ORDER BY c.income_account_id`,
    sale.id,
  )
  return rows.filter(r => r.amount > 0).map(r => ({ account: r.account ?? INCOME, amountMinor: -r.amount, ...where }))
}

export default {
  async settle(unit: UnitView, part: Part) {
    const sale = await saleFor(part)
    if (!sale || sale.state !== 'awaiting_payment' || sale.intent_id !== part.intentId || sale.total_minor !== part.amountMinor)
      refuse(NOT_WAITING.code, NOT_WAITING.reason, { status: 409 })
    const at = nowMs()
    unit.add({
      sql: "UPDATE bar_sales SET state = 'paid', part_id = ?, paid_at = ?, updated_at = ? WHERE id = ? AND state = 'awaiting_payment' AND intent_id = ? AND total_minor = ?",
      params: [part.id, at, at, sale!.id, part.intentId, part.amountMinor],
    }).expect(1, NOT_WAITING)
    unit.announce('bar.sale.paid', { saleId: sale!.id, openingId: sale!.opening_id }, { record: ['bar.sale', sale!.id] })
    return await income(sale!, part.amountMinor, -1)
  },

  // Refunds of bar sales with reversals and stock are a later slice (BAR-19). Until then a refund
  // made from Payments takes the income back from bar.income.
  async refunded(_unit: UnitView, part: Part, refund: { id: string, amountMinor: number }) {
    const sale = await saleFor(part)
    if (!sale) throw new Error(`No bar sale ${part.record} for payment part ${part.id}`)
    return await income(sale, refund.amountMinor, 1)
  },

  // The payment did not complete: the sale is open again with its lines, to change or pay again.
  release(unit: UnitView, part: Part) {
    unit.add({ sql: "UPDATE bar_sales SET state = 'open', intent_id = NULL, updated_at = ? WHERE id = ? AND state = 'awaiting_payment' AND intent_id = ?", params: [nowMs(), part.record, part.intentId] })
  },
} satisfies Settlement
