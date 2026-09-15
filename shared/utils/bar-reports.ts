import { z } from 'zod'
import { londonDayField } from '#shared/utils/membership'
import type { Page } from '#shared/utils/pagination'

// Sales, GP, variance, comp and discount reports (F-119): a query over the ledger and the
// movement history, never a stored aggregate, so a correction lands immediately (criterion 4).

export const REPORT_PERIOD_KINDS = ['NIGHT', 'WEEK', 'SEASON', 'CUSTOM'] as const
export type ReportPeriodKind = (typeof REPORT_PERIOD_KINDS)[number]

// The one civil-date field, shape and calendar both: 2026-13-45 has the shape and is no day at
// all, so it would reach a period bound and sort after every real date it met (0014).
const isoDate = londonDayField

// One shape per kind, so a night needs only a night and a custom range cannot forget its `to`.
export const reportPeriodForm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NIGHT'), night: isoDate }),
  z.object({ kind: z.literal('WEEK'), day: isoDate }),
  z.object({ kind: z.literal('SEASON'), year: z.coerce.number().int() }),
  z.object({ kind: z.literal('CUSTOM'), from: isoDate, to: isoDate }),
])

export type ReportPeriodInput = z.output<typeof reportPeriodForm>

export const REPORT_SECTIONS = ['sales', 'gp', 'variance', 'comps', 'discounts', 'wastage'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]

// Comps and variance are one row per comp and per adjusted stocktake line, so a season is
// unbounded in both: they page on the screen and in larger blocks in the export (criterion 2).
export const REPORT_EXPORT_PAGE_ROWS = 1000

// What a paged section says when it does not fit, so the first page is never read as the whole.
export function saysPageOf(page: Page<unknown>): string {
  if (page.items.length === 0) return `Nothing on this page. There are ${page.total} in the period.`
  const first = (page.page - 1) * page.pageSize + 1
  return `Showing ${first} to ${first + page.items.length - 1} of ${page.total}. Narrow the period to see the rest.`
}

export interface SalesRow {
  categoryName: string
  productName: string
  variantLabel: string
  qty: number
  revenuePence: number
}

export interface GpRow {
  itemName: string
  qtyDepleted: number
  costPence: number
}

export interface GpReport {
  revenuePence: number
  costPence: number
  grossProfitPence: number
  byItem: GpRow[]
}

export interface VarianceRow {
  stocktakeId: string
  itemName: string
  appliedAt: number
  qtyVariance: number
  valuePence: number
}

export interface CompRow {
  entryId: string
  happenedAt: number
  reason: string
  approvedByName: string
  foregonePence: number
}

export interface DiscountRow {
  discountId: string
  discountName: string
  percent: number
  timesApplied: number
  discountedPence: number
}

// One row per reason per item, so the catalogue bounds it the way the gross profit table is
// bounded. Detail is never grouped by: it says which bottle, not which kind of loss (0079).
export interface WastageRow {
  reason: string
  itemName: string
  categoryName: string
  qtyWasted: number
  costPence: number
}

export interface BarReport {
  fromAt: number
  toAt: number
  sales: SalesRow[]
  gp: GpReport
  variance: Page<VarianceRow>
  comps: Page<CompRow>
  discounts: DiscountRow[]
  wastage: WastageRow[]
}
