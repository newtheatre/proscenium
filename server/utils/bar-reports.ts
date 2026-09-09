import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { committeeYearEnd, fromLondonWallClock, startOfLondonDay } from '#shared/utils/london'
import { showNightBounds } from '#shared/utils/show-night'
import type { BarReport, CompRow, DiscountRow, GpReport, GpRow, ReportPeriodInput, SalesRow, VarianceRow } from '#shared/utils/bar-reports'

// Every figure is a query over the ledger and the movement history, run fresh for the period
// asked for; nothing here is a stored aggregate (F-119 criterion 4).

const DAY_SECONDS = 24 * 60 * 60
const WEEK_DAYS = 7

// Resolves a period to [fromAt, toAt) in unix seconds, on the London calendar throughout
// (criterion 1, 0014). A week is the seven London days starting on the day named.
export function resolveReportPeriod(period: ReportPeriodInput): { fromAt: number, toAt: number } {
  if (period.kind === 'NIGHT') {
    const { from, to } = showNightBounds(period.night)
    return { fromAt: Math.floor(from.getTime() / 1000), toAt: Math.floor(to.getTime() / 1000) }
  }
  if (period.kind === 'WEEK') {
    const fromAt = Math.floor(startOfLondonDay(period.day).getTime() / 1000)
    return { fromAt, toAt: fromAt + WEEK_DAYS * DAY_SECONDS }
  }
  if (period.kind === 'SEASON') {
    // committeeYearEnd is the last instant of the year, inclusive; +1 makes the bound exclusive
    // like every other period here.
    const toAt = Math.floor(committeeYearEnd(period.year).getTime() / 1000) + 1
    const fromAt = Math.floor(fromLondonWallClock(period.year - 1, 8, 1).getTime() / 1000)
    return { fromAt, toAt }
  }
  const fromAt = Math.floor(startOfLondonDay(period.from).getTime() / 1000)
  const toAt = Math.floor(startOfLondonDay(period.to).getTime() / 1000) + DAY_SECONDS
  if (toAt <= fromAt) throw createError({ statusCode: 400, statusMessage: 'A custom range must end after it starts' })
  return { fromAt, toAt }
}

export async function salesReport(fromAt: number, toAt: number): Promise<SalesRow[]> {
  return db.all<SalesRow>(sql`
    SELECT c.name AS categoryName, p.name AS productName, v.label AS variantLabel,
           sum(l.qty) AS qty, sum(l.amount_pence) AS revenuePence
    FROM ledger_lines l
    JOIN ledger_entries e ON e.id = l.entry_id
    JOIN product_variants v ON v.id = l.product_variant_id
    JOIN bar_products p ON p.id = v.product_id
    JOIN bar_categories c ON c.id = p.category_id
    WHERE l.kind = 'BAR_ITEM' AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
    GROUP BY c.id, p.id, v.id
    ORDER BY c.sort, c.name COLLATE NOCASE, p.name COLLATE NOCASE, v.label COLLATE NOCASE
  `)
}

// Cost basis is the weighted average `unit_cost_pence` across every delivery the item has ever
// had, not just this period's: a period with no delivery still has a cost to weigh its sales against.
export async function grossProfitReport(fromAt: number, toAt: number): Promise<GpReport> {
  const [revenue] = await db.all<{ revenuePence: number }>(sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS revenuePence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE l.kind = 'BAR_ITEM' AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `)

  const byItem = await db.all<GpRow>(sql`
    SELECT i.name AS itemName, -sum(m.qty) AS qtyDepleted,
           round(-sum(m.qty) * coalesce((
             SELECT sum(d.qty * d.unit_cost_pence) * 1.0 / sum(d.qty)
             FROM stock_movements d WHERE d.item_id = i.id AND d.kind = 'DELIVERY' AND d.unit_cost_pence IS NOT NULL
           ), 0)) AS costPence
    FROM stock_movements m JOIN bar_items i ON i.id = m.item_id
    WHERE m.kind = 'SALE' AND m.created_at >= ${fromAt} AND m.created_at < ${toAt}
    GROUP BY i.id
    ORDER BY i.name COLLATE NOCASE
  `)

  const revenuePence = revenue?.revenuePence ?? 0
  const costPence = byItem.reduce((sum, row) => sum + row.costPence, 0)
  return { revenuePence, costPence, grossProfitPence: revenuePence - costPence, byItem }
}

export async function stocktakeVarianceReport(fromAt: number, toAt: number): Promise<VarianceRow[]> {
  return db.all<VarianceRow>(sql`
    SELECT st.id AS stocktakeId, i.name AS itemName, st.applied_at AS appliedAt,
           m.qty AS qtyVariance, round(m.qty * coalesce((
             SELECT sum(d.qty * d.unit_cost_pence) * 1.0 / sum(d.qty)
             FROM stock_movements d WHERE d.item_id = i.id AND d.kind = 'DELIVERY' AND d.unit_cost_pence IS NOT NULL
           ), 0)) AS valuePence
    FROM stock_movements m
    JOIN stocktake_lines sl ON sl.id = m.ref_id AND m.ref_table = 'stocktake_lines'
    JOIN stocktakes st ON st.id = sl.stocktake_id
    JOIN bar_items i ON i.id = m.item_id
    WHERE st.applied_at >= ${fromAt} AND st.applied_at < ${toAt}
    ORDER BY st.applied_at, i.name COLLATE NOCASE
  `)
}

export async function compsReport(fromAt: number, toAt: number): Promise<CompRow[]> {
  return db.all<CompRow>(sql`
    SELECT e.id AS entryId, e.happened_at AS happenedAt, e.comp_reason AS reason, u.name AS approvedByName,
           coalesce((SELECT sum(l.unit_price_pence * l.qty) FROM ledger_lines l WHERE l.entry_id = e.id), 0) AS foregonePence
    FROM ledger_entries e
    LEFT JOIN users u ON u.id = e.comp_approved_by
    WHERE e.tender = 'COMP' AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
    ORDER BY e.happened_at
  `)
}

export async function discountsReport(fromAt: number, toAt: number): Promise<DiscountRow[]> {
  return db.all<DiscountRow>(sql`
    SELECT l.discount_id AS discountId, max(l.discount_percent) AS percent,
           coalesce(d.name, '(deleted discount)') AS discountName,
           count(*) AS timesApplied, sum(l.discount_pence) AS discountedPence
    FROM ledger_lines l
    JOIN ledger_entries e ON e.id = l.entry_id
    LEFT JOIN discounts d ON d.id = l.discount_id
    WHERE l.discount_id IS NOT NULL AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
    GROUP BY l.discount_id, d.name
    ORDER BY discountedPence DESC
  `)
}

export async function barReport(period: ReportPeriodInput): Promise<BarReport> {
  const { fromAt, toAt } = resolveReportPeriod(period)
  const [sales, gp, variance, comps, discounts] = await Promise.all([
    salesReport(fromAt, toAt),
    grossProfitReport(fromAt, toAt),
    stocktakeVarianceReport(fromAt, toAt),
    compsReport(fromAt, toAt),
    discountsReport(fromAt, toAt),
  ])
  return { fromAt, toAt, sales, gp, variance, comps, discounts }
}
