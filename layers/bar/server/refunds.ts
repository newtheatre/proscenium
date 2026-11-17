// Refunding a paid bar sale (Bar specification, tab 4, "Refunding a paid bar sale"). Asking writes one
// reversal per line, which holds the quantity and amount against the line, and asks Payments to refund
// the bar's part of the payment, in one batch. Income moves only when Payments says the money has gone
// back; a refund that fails or is declined lets go of what it held. A paid sale is never edited.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { accountLabel, assertTerm } from '#modules/core'
import { requestRefund } from '#modules/payments'
import type { OwnerEntry } from '#modules/payments'
import { STOCK_OUTCOMES } from './db/schema'

export const REASONS = 'bar.refund-reason'
const INCOME = { key: 'bar.income' }

export interface SaleLine {
  id: string
  label: string
  quantity: number
  unitMinor: number
  amountMinor: number
  /** What refunds hold or have taken, failed ones aside. */
  reversedQuantity: number
  reversedMinor: number
  reversals: { id: string, state: 'requested' | 'succeeded' | 'failed', quantity: number, amountMinor: number, reason: string, stockOutcome: string, at: number }[]
}

export interface SaleDetail {
  id: string
  reference: string
  state: 'open' | 'awaiting_payment' | 'paid' | 'void'
  totalMinor: number
  currency: string
  outlet: string
  openingId: string
  operatingDay: string
  soldBy: string
  at: number
  paidAt: number | null
  intentId: string | null
  lines: SaleLine[]
}

const LABEL = "CASE WHEN v.name = 'Each' THEN p.name ELSE p.name || ', ' || v.name END"

export async function saleByReference(reference: string): Promise<SaleDetail | null> {
  const sale = await first<Omit<SaleDetail, 'lines' | 'soldBy'> & { soldById: string | null }>(
    `SELECT s.id, s.reference, s.state, s.total_minor AS totalMinor, s.currency, t.name AS outlet, s.opening_id AS openingId,
            o.operating_day AS operatingDay, s.sold_by AS soldById, s.created_at AS at, s.paid_at AS paidAt, s.intent_id AS intentId
       FROM bar_sales s JOIN bar_openings o ON o.id = s.opening_id JOIN bar_outlets t ON t.id = o.outlet_id
      WHERE s.reference = ?`,
    reference,
  )
  if (!sale) return null
  const lines = await all<Omit<SaleLine, 'reversals'>>(
    `SELECT l.id, ${LABEL} || coalesce(' · ' || (SELECT group_concat(c.label, ', ') FROM bar_sale_line_choices c WHERE c.sale_line_id = l.id), '') AS label, l.quantity, l.unit_minor AS unitMinor, l.amount_minor AS amountMinor,
            coalesce((SELECT sum(r.quantity) FROM bar_sale_reversals r WHERE r.sale_line_id = l.id AND r.state <> 'failed'), 0) AS reversedQuantity,
            coalesce((SELECT sum(r.amount_minor) FROM bar_sale_reversals r WHERE r.sale_line_id = l.id AND r.state <> 'failed'), 0) AS reversedMinor
       FROM bar_sale_lines l JOIN bar_variants v ON v.id = l.variant_id JOIN bar_products p ON p.id = v.product_id
      WHERE l.sale_id = ? ORDER BY l.created_at, l.id`,
    sale.id,
  )
  const reversals = await all<SaleLine['reversals'][number] & { lineId: string }>(
    `SELECT r.id, r.sale_line_id AS lineId, r.state, r.quantity, r.amount_minor AS amountMinor, term.label AS reason, r.stock_outcome AS stockOutcome, r.created_at AS at
       FROM bar_sale_reversals r JOIN bar_sale_lines l ON l.id = r.sale_line_id LEFT JOIN core_terms term ON term.id = r.reason_term
      WHERE l.sale_id = ? ORDER BY r.created_at, r.id`,
    sale.id,
  )
  const { soldById, ...rest } = sale
  return {
    ...rest,
    soldBy: soldById ? await accountLabel(soldById) : '',
    lines: lines.map(l => ({ ...l, reversals: reversals.filter(r => r.lineId === l.id).map(({ lineId: _, ...r }) => r) })),
  }
}

export const salesFilters = z.object({
  q: z.string().trim().max(20).optional(), // not-policy: a reference's length, with room
  outlet: z.string().min(1).max(64).optional(), // not-policy: an id's length
  state: z.enum(['open', 'awaiting_payment', 'paid', 'void']).optional(),
  refunded: z.enum(['yes']).optional(),
}).strict()

export interface SaleRow { reference: string, at: number, outlet: string, items: number, totalMinor: number, refundedMinor: number, state: SaleDetail['state'] }

const PAGE = 100 // not-policy: one screen of sales

/** Bar sales, newest first. */
export async function listSales(filters: z.infer<typeof salesFilters>): Promise<SaleRow[]> {
  const q = filters.q ? `%${filters.q.toUpperCase()}%` : null
  return await all<SaleRow>(
    `SELECT s.reference, s.created_at AS at, t.name AS outlet, s.total_minor AS totalMinor, s.state,
            coalesce((SELECT sum(quantity) FROM bar_sale_lines WHERE sale_id = s.id), 0) AS items,
            coalesce((SELECT sum(r.amount_minor) FROM bar_sale_reversals r JOIN bar_sale_lines l ON l.id = r.sale_line_id WHERE l.sale_id = s.id AND r.state = 'succeeded'), 0) AS refundedMinor
       FROM bar_sales s JOIN bar_openings o ON o.id = s.opening_id JOIN bar_outlets t ON t.id = o.outlet_id
      WHERE (? IS NULL OR s.reference LIKE ?) AND (? IS NULL OR o.outlet_id = ?) AND (? IS NULL OR s.state = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM bar_sale_reversals r JOIN bar_sale_lines l ON l.id = r.sale_line_id WHERE l.sale_id = s.id AND r.state <> 'failed'))
      ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    q, q, filters.outlet ?? null, filters.outlet ?? null, filters.state ?? null, filters.state ?? null, filters.refunded ?? null, PAGE,
  )
}

export const refundInput = z.object({
  // Each line refunded: a quantity of what was sold, or with quantity 0 a goodwill amount.
  lines: z.array(z.object({
    lineId: z.string().min(1).max(64), // not-policy: an id's length
    quantity: z.number().int().min(0).max(99), // not-policy: one line's quantity
    goodwillMinor: z.number().int().min(1).optional(),
  }).strict()).min(1).max(50), // not-policy: one sale's lines
  reasonTermId: z.string().min(1).max(64), // not-policy: an id's length
  stockOutcome: z.enum(STOCK_OUTCOMES),
  // The amount on the button the seller pressed.
  expectedTotalMinor: z.number().int().min(1),
}).strict()
export type RefundInput = z.infer<typeof refundInput>

const TOO_MUCH = { code: 'bar.refund.too-much', reason: 'That is more than is left to refund on this sale.', remedy: 'Refresh the sale and choose again.' }

/** Asks for a refund of a paid sale: the reversals and Payments' refund in one batch. */
export async function refundSale(unit: UnitView, reference: string, input: RefundInput, by: string | null): Promise<{ refundId: string, state: 'requested' | 'approved', amountMinor: number }> {
  const sale = await saleByReference(reference)
  if (!sale) refuse('core.not-found', 'There is no such bar sale.', { status: 404 })
  if (sale!.state !== 'paid') refuse('bar.refund.not-paid', 'Only a paid bar sale can be refunded.', { status: 409 })
  const part = await first<{ part_id: string | null }>('SELECT part_id FROM bar_sales WHERE id = ?', sale!.id)
  if (!part?.part_id) refuse('bar.refund.not-paid', 'Only a paid bar sale can be refunded.', { status: 409 })

  const byId = new Map(sale!.lines.map(l => [l.id, l]))
  const seen = new Set<string>()
  const reversals = input.lines.map((asked) => {
    const line = byId.get(asked.lineId)
    if (!line || seen.has(asked.lineId)) refuse('bar.refund.bad-line', 'That line is not on this sale.', { status: 422 })
    seen.add(asked.lineId)
    if (asked.quantity === 0 && !asked.goodwillMinor) refuse('bar.refund.nothing', 'Choose a quantity, or an amount of goodwill.', { status: 422 })
    if (asked.quantity > 0 && asked.goodwillMinor) refuse('bar.refund.both', 'A line is refunded by quantity or by a goodwill amount, not both.', { status: 422 })
    const amountMinor = asked.quantity > 0 ? asked.quantity * line!.unitMinor : asked.goodwillMinor!
    if (asked.quantity > line!.quantity - line!.reversedQuantity || amountMinor > line!.amountMinor - line!.reversedMinor)
      refuse(TOO_MUCH.code, TOO_MUCH.reason, { status: 409, remedy: TOO_MUCH.remedy })
    return { line: line!, quantity: asked.quantity, amountMinor }
  })
  const total = reversals.reduce((s, r) => s + r.amountMinor, 0)
  if (total !== input.expectedTotalMinor)
    refuse('bar.refund.total-changed', `The refund comes to ${total}, not ${input.expectedTotalMinor}.`, { status: 409, remedy: 'Check the lines and try again.' })

  const asked = await requestRefund(unit, { partId: part!.part_id!, amountMinor: total, requestedBy: by })
  const at = nowMs()
  for (const r of reversals) {
    // The line's triggers refuse a reversal past what was sold, however two refunds race.
    unit.add(sql`INSERT INTO bar_sale_reversals (id, sale_line_id, refund_id, state, quantity, amount_minor, reason_term, stock_outcome, requested_by, created_at, updated_at)
      SELECT ${newId('bsrv')}, ${r.line.id}, ${asked.refundId}, 'requested', ${r.quantity}, ${r.amountMinor}, ${input.reasonTermId}, ${input.stockOutcome}, ${by}, ${at}, ${at}
       WHERE ${assertTerm(input.reasonTermId, REASONS)}`)
      .expect(1, { code: 'bar.refund.bad-reason', reason: 'That reason is not on the list.', remedy: 'Choose a reason from the list.' })
  }
  unit.audit({ action: 'state', record: ['bar.sale', sale!.id], detail: { to: 'refund-requested', refundId: asked.refundId, amountMinor: total } })
  return { ...asked, amountMinor: total }
}

/**
 * The money has gone back: the refund's reversals succeed and the income comes off the accounts it
 * went to. A refund made from Payments' own screens, with no reversals, comes off bar.income.
 */
export async function refunded(unit: UnitView, saleId: string, refund: { id: string, amountMinor: number }, where: { productionId: string | null, performanceId: string | null }): Promise<OwnerEntry[]> {
  const rows = await all<{ account: string | null, amount: number }>(
    `SELECT c.income_account_id AS account, sum(r.amount_minor) AS amount FROM bar_sale_reversals r
       JOIN bar_sale_lines l ON l.id = r.sale_line_id JOIN bar_variants v ON v.id = l.variant_id
       JOIN bar_products p ON p.id = v.product_id JOIN bar_categories c ON c.id = p.category_id
      WHERE r.refund_id = ? AND r.state = 'requested' AND l.sale_id = ? GROUP BY c.income_account_id ORDER BY c.income_account_id`,
    refund.id, saleId,
  )
  if (!rows.length) return [{ account: INCOME, amountMinor: refund.amountMinor, ...where }]
  const at = nowMs()
  unit.add({ sql: "UPDATE bar_sale_reversals SET state = 'succeeded', updated_at = ? WHERE refund_id = ? AND state = 'requested'", params: [at, refund.id] })
  unit.announce('bar.sale.refunded', { saleId, refundId: refund.id }, { record: ['bar.sale', saleId] })
  return rows.map(r => ({ account: r.account ?? INCOME, amountMinor: r.amount, ...where }))
}

/** The refund failed or was declined: its reversals let go of what they held. Safe to repeat. */
export function released(unit: UnitView, refundId: string): void {
  unit.add({ sql: "UPDATE bar_sale_reversals SET state = 'failed', updated_at = ? WHERE refund_id = ? AND state = 'requested'", params: [nowMs(), refundId] })
}
