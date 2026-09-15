import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { committeeYearEnd, fromLondonWallClock, startOfLondonDayAfter } from '#shared/utils/london'
import { showNightBounds } from '#shared/utils/show-night'
import { envelope, offsetFor } from '#shared/utils/pagination'
import type { SQL } from 'drizzle-orm'
import type { Page } from '#shared/utils/pagination'
import type { BarReport, CompRow, DiscountRow, GpReport, GpRow, ReportPeriodInput, SalesRow, VarianceRow } from '#shared/utils/bar-reports'

// Every figure is a query over the ledger and the movement history, run fresh for the period
// asked for; nothing here is a stored aggregate (F-119 criterion 4).

const WEEK_DAYS = 7

export interface ReportPaging { page: number, pageSize: number }

const londonDayStart = (day: string, plusDays = 0): number =>
  Math.floor(startOfLondonDayAfter(day, plusDays).getTime() / 1000)

// Resolves a period to [fromAt, toAt) in unix seconds, on the London calendar throughout
// (criterion 1, 0014). A week is the seven London days starting on the day named.
export function resolveReportPeriod(period: ReportPeriodInput): { fromAt: number, toAt: number } {
  if (period.kind === 'NIGHT') {
    const { from, to } = showNightBounds(period.night)
    return { fromAt: Math.floor(from.getTime() / 1000), toAt: Math.floor(to.getTime() / 1000) }
  }
  if (period.kind === 'WEEK') {
    return { fromAt: londonDayStart(period.day), toAt: londonDayStart(period.day, WEEK_DAYS) }
  }
  if (period.kind === 'SEASON') {
    // committeeYearEnd is the last instant of the year, inclusive; +1 makes the bound exclusive
    // like every other period here.
    const toAt = Math.floor(committeeYearEnd(period.year).getTime() / 1000) + 1
    const fromAt = Math.floor(fromLondonWallClock(period.year - 1, 8, 1).getTime() / 1000)
    return { fromAt, toAt }
  }
  const fromAt = londonDayStart(period.from)
  const toAt = londonDayStart(period.to, 1)
  if (toAt <= fromAt) throw createError({ statusCode: 400, statusMessage: 'A custom range must end after it starts' })
  return { fromAt, toAt }
}

// The delivered cost of one unit of stocked item `i`: the weighted average across every
// unreversed delivery, or null if it has never had one; callers coalesce it their own way.
export const unitCostPence = sql`(
  SELECT sum(d.qty * d.unit_cost_pence) * 1.0 / sum(d.qty)
  FROM stock_movements d
  WHERE d.item_id = i.id AND d.kind = 'DELIVERY' AND d.unit_cost_pence IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_id = d.id)
)`

export function salesQuery(fromAt: number, toAt: number): SQL {
  return sql`
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
  `
}

export async function salesReport(fromAt: number, toAt: number): Promise<SalesRow[]> {
  return db.all<SalesRow>(salesQuery(fromAt, toAt))
}

export function gpRevenueQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS revenuePence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE l.kind = 'BAR_ITEM' AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

// A pour runs on its entry's clock, so a late sale keeps revenue and cost together, and a comp
// pours like a paid sale (F-110 criterion 4).

// A REVERSAL nets in on its own clock rather than removing the pour: the credit it belongs to is
// a new entry in a later period, so taking the cost out of the first one would flatter it.
export function gpDepletionQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT i.name AS itemName, -sum(m.qty) AS qtyDepleted,
           round(-sum(m.qty) * coalesce(${unitCostPence}, 0)) AS costPence
    FROM stock_movements m
    JOIN bar_items i ON i.id = m.item_id
    WHERE (
      m.kind IN ('SALE', 'COMP') AND EXISTS (
        SELECT 1 FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
        WHERE l.id = m.ref_id AND m.ref_table = 'ledger_lines'
          AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
      )
    ) OR (
      m.kind = 'REVERSAL' AND m.created_at >= ${fromAt} AND m.created_at < ${toAt}
      AND EXISTS (SELECT 1 FROM stock_movements t WHERE t.id = m.reverses_id AND t.kind IN ('SALE', 'COMP'))
    )
    GROUP BY i.id
    HAVING sum(m.qty) <> 0
    ORDER BY i.name COLLATE NOCASE
  `
}

export async function grossProfitReport(fromAt: number, toAt: number): Promise<GpReport> {
  const [revenue] = await db.all<{ revenuePence: number }>(gpRevenueQuery(fromAt, toAt))
  const byItem = await db.all<GpRow>(gpDepletionQuery(fromAt, toAt))
  const revenuePence = revenue?.revenuePence ?? 0
  const costPence = byItem.reduce((sum, row) => sum + row.costPence, 0)
  return { revenuePence, costPence, grossProfitPence: revenuePence - costPence, byItem }
}

const varianceScope = (fromAt: number, toAt: number): SQL => sql`
  FROM stock_movements m
  JOIN stocktake_lines sl ON sl.id = m.ref_id AND m.ref_table = 'stocktake_lines'
  JOIN stocktakes st ON st.id = sl.stocktake_id
  JOIN bar_items i ON i.id = m.item_id
  WHERE st.applied_at >= ${fromAt} AND st.applied_at < ${toAt}
`

export function varianceQuery(fromAt: number, toAt: number, limit: number, offset: number): SQL {
  return sql`
    SELECT st.id AS stocktakeId, i.name AS itemName, st.applied_at AS appliedAt,
           m.qty AS qtyVariance, round(m.qty * coalesce(${unitCostPence}, 0)) AS valuePence
    ${varianceScope(fromAt, toAt)}
    ORDER BY st.applied_at, i.name COLLATE NOCASE, m.id
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function varianceCountQuery(fromAt: number, toAt: number): SQL {
  return sql`SELECT count(*) AS total ${varianceScope(fromAt, toAt)}`
}

export async function stocktakeVarianceReport(fromAt: number, toAt: number, paging: ReportPaging): Promise<Page<VarianceRow>> {
  const [counted] = await db.all<{ total: number }>(varianceCountQuery(fromAt, toAt))
  const items = await db.all<VarianceRow>(varianceQuery(fromAt, toAt, paging.pageSize, offsetFor(paging.page, paging.pageSize)))
  return envelope(items, counted?.total ?? 0, paging.page, paging.pageSize)
}

// `source = 'TILL'`: module D's ticket comps post comp entries too, and this is the bar manager's
// section, not the box office's.
const compsScope = (fromAt: number, toAt: number): SQL => sql`
  FROM ledger_entries e
  LEFT JOIN users u ON u.id = e.comp_approved_by
  WHERE e.tender = 'COMP' AND e.source = 'TILL' AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
`

// The id breaks the tie: two comps in the same second have no other order, and a page boundary
// between them would otherwise repeat one row and drop another (criterion 2).
export function compsQuery(fromAt: number, toAt: number, limit: number, offset: number): SQL {
  return sql`
    SELECT e.id AS entryId, e.happened_at AS happenedAt, e.comp_reason AS reason, u.name AS approvedByName,
           coalesce((SELECT sum(l.unit_price_pence * l.qty) FROM ledger_lines l WHERE l.entry_id = e.id), 0) AS foregonePence
    ${compsScope(fromAt, toAt)}
    ORDER BY e.happened_at, e.id
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function compsCountQuery(fromAt: number, toAt: number): SQL {
  return sql`SELECT count(*) AS total ${compsScope(fromAt, toAt)}`
}

export async function compsReport(fromAt: number, toAt: number, paging: ReportPaging): Promise<Page<CompRow>> {
  const [counted] = await db.all<{ total: number }>(compsCountQuery(fromAt, toAt))
  const items = await db.all<CompRow>(compsQuery(fromAt, toAt, paging.pageSize, offsetFor(paging.page, paging.pageSize)))
  return envelope(items, counted?.total ?? 0, paging.page, paging.pageSize)
}

export function discountsQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT l.discount_id AS discountId, max(l.discount_percent) AS percent,
           coalesce(d.name, '(deleted discount)') AS discountName,
           count(*) AS timesApplied, sum(l.discount_pence) AS discountedPence
    FROM ledger_lines l
    JOIN ledger_entries e ON e.id = l.entry_id
    LEFT JOIN discounts d ON d.id = l.discount_id
    WHERE l.discount_id IS NOT NULL AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
    GROUP BY l.discount_id, d.name
    ORDER BY discountedPence DESC
  `
}

export async function discountsReport(fromAt: number, toAt: number): Promise<DiscountRow[]> {
  return db.all<DiscountRow>(discountsQuery(fromAt, toAt))
}

export async function barReport(period: ReportPeriodInput, paging: ReportPaging): Promise<BarReport> {
  const { fromAt, toAt } = resolveReportPeriod(period)
  const [sales, gp, variance, comps, discounts] = await Promise.all([
    salesReport(fromAt, toAt),
    grossProfitReport(fromAt, toAt),
    stocktakeVarianceReport(fromAt, toAt, paging),
    compsReport(fromAt, toAt, paging),
    discountsReport(fromAt, toAt),
  ])
  return { fromAt, toAt, sales, gp, variance, comps, discounts }
}
