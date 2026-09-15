import { z } from 'zod'
import { daysAfter } from '#shared/utils/membership'

// Sales, GP, variance, comp and discount reports (F-119): a query over the ledger and the
// movement history, never a stored aggregate, so a correction lands immediately (criterion 4).

export const REPORT_PERIOD_KINDS = ['NIGHT', 'WEEK', 'SEASON', 'CUSTOM'] as const
export type ReportPeriodKind = (typeof REPORT_PERIOD_KINDS)[number]

// The shape and the day both: 2026-13-45 has the shape and is no day at all, so it would reach a
// period bound and sort after every real date it met (0014). The round trip is membership's.
const DAY = /^\d{4}-\d{2}-\d{2}$/
const isoDate = z.string().regex(DAY, 'A date is YYYY-MM-DD')
  .refine(day => !DAY.test(day) || daysAfter(day, 0) === day, 'A date is YYYY-MM-DD')

// One shape per kind, so a night needs only a night and a custom range cannot forget its `to`.
export const reportPeriodForm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NIGHT'), night: isoDate }),
  z.object({ kind: z.literal('WEEK'), day: isoDate }),
  z.object({ kind: z.literal('SEASON'), year: z.coerce.number().int() }),
  z.object({ kind: z.literal('CUSTOM'), from: isoDate, to: isoDate }),
])

export type ReportPeriodInput = z.output<typeof reportPeriodForm>

export const REPORT_SECTIONS = ['sales', 'gp', 'variance', 'comps', 'discounts'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]

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

export interface BarReport {
  fromAt: number
  toAt: number
  sales: SalesRow[]
  gp: GpReport
  variance: VarianceRow[]
  comps: CompRow[]
  discounts: DiscountRow[]
}
