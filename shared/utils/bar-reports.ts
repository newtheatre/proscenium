import { z } from 'zod'
import { MOVEMENT_REASONS } from '#shared/utils/bar'
import { londonDayField } from '#shared/utils/membership'
import { londonClock } from '#shared/utils/london'
import { londonDayOf } from '#shared/utils/ledger'
import type { MovementReason, StockUnit } from '#shared/utils/bar'
import type { Page } from '#shared/utils/pagination'

// Sales, GP, variance, comp, discount and wastage reports (F-119, 0079): a query over the ledger
// and the movement history, never a stored aggregate, so a correction lands immediately (criterion 4).

export const REPORT_PERIOD_KINDS = ['NIGHT', 'WEEK', 'YEAR', 'CUSTOM'] as const
export type ReportPeriodKind = (typeof REPORT_PERIOD_KINDS)[number]

// The one civil-date field, shape and calendar both: 2026-13-45 has the shape and is no day at
// all, so it would reach a period bound and sort after every real date it met (0014).
const isoDate = londonDayField

// One shape per kind, so a night needs only a night and a custom range cannot forget its `to`.
export const reportPeriodForm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NIGHT'), night: isoDate }),
  z.object({ kind: z.literal('WEEK'), day: isoDate }),
  z.object({ kind: z.literal('YEAR'), year: z.coerce.number().int() }),
  z.object({ kind: z.literal('CUSTOM'), from: isoDate, to: isoDate }),
])

export type ReportPeriodInput = z.output<typeof reportPeriodForm>

export const REPORT_SECTIONS = ['sales', 'gp', 'variance', 'comps', 'discounts', 'wastage'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]

// Comps and variance are one row per comp and per adjusted stocktake line, so a season is
// unbounded in both: they page on the screen and in larger blocks in the export (criterion 2).
export const REPORT_EXPORT_PAGE_ROWS = 1000

// Every reason except the two that mean the stock was never lost: a recount and an opening
// balance move the figure without anything leaving the shelf (0079).
const NOT_A_LOSS: MovementReason[] = ['COUNT_CORRECTION', 'OPENING_BALANCE']
export const WASTAGE_REASONS: MovementReason[] = MOVEMENT_REASONS.filter(reason => !NOT_A_LOSS.includes(reason))

// A CSV is read by a spreadsheet, so money is a plain decimal under a "(£)" heading, a minus is
// ASCII and a moment is an ISO London date: the SU export's conventions, not the screen's (0128).
export const csvPounds = (pence: number): string => (pence / 100).toFixed(2)

export function csvWhen(at: number): string {
  const instant = new Date(at * 1000)
  return `${londonDayOf(instant)} ${londonClock(instant)}`
}

// Declared rather than read off the first row, so a period with nothing in it still exports its heading.
export const BAR_REPORT_COLUMNS: Record<ReportSection, string[]> = {
  sales: ['Category', 'Product', 'Size', 'Quantity', 'Revenue (£)'],
  gp: ['Item', 'Unit', 'Quantity poured', 'Cost (£)'],
  variance: ['Stocktake opened', 'Stocktake applied', 'Item', 'Unit', 'Variance', 'Value (£)'],
  comps: ['When', 'Reason', 'Approved by', 'Forgone (£)'],
  discounts: ['Discount', 'Percent', 'Sales given it', 'Discounted (£)'],
  wastage: ['Reason', 'Item', 'Stock group', 'Unit', 'Quantity wasted', 'Cost (£)'],
}

function periodForFile(period: ReportPeriodInput): string {
  switch (period.kind) {
    case 'NIGHT': return `night-${period.night}`
    case 'WEEK': return `week-from-${period.day}`
    case 'YEAR': return `year-to-july-${period.year}`
    case 'CUSTOM': return `${period.from}-to-${period.to}`
  }
}

// Two exports of different periods never share a name, so a download folder keeps both.
export function barReportFileName(section: ReportSection, period: ReportPeriodInput, paging?: { page: number, pages: number }): string {
  const paged = paging && paging.pages > 1 ? `-page-${paging.page}-of-${paging.pages}` : ''
  return `bar-${section}-${periodForFile(period)}${paged}`
}

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
  unit: StockUnit
  qtyDepleted: number
  costPence: number
}

export interface GpReport {
  revenuePence: number
  costPence: number
  grossProfitPence: number
  byItem: GpRow[]
  // Products sold with no stock poured, and items poured with no delivered cost: either way the
  // cost side is short, so the screen names them rather than overstating profit.
  unpoured: string[]
  uncosted: string[]
}

export interface VarianceRow {
  stocktakeId: string
  itemName: string
  unit: StockUnit
  openedAt: number
  appliedAt: number
  qtyVariance: number
  valuePence: number
}

export interface VarianceSection extends Page<VarianceRow> {
  // The whole period's value, not the page's: quantities do not sum across units, money does.
  totalValuePence: number
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
  unit: StockUnit
  categoryName: string
  qtyWasted: number
  costPence: number
}

export interface BarReport {
  fromAt: number
  toAt: number
  sales: SalesRow[]
  gp: GpReport
  variance: VarianceSection
  comps: Page<CompRow>
  discounts: DiscountRow[]
  wastage: WastageRow[]
}
