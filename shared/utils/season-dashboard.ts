import { z } from 'zod'

// The treasurer's season dashboard (I-105): every figure a query over the ledger, never stored.
// Term waits on I-107's periods table, not yet built, so it is not a selectable kind here.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is YYYY-MM-DD')

export const PERIOD_KINDS = ['DAY', 'WEEK', 'MONTH', 'SEASON'] as const
export type PeriodKind = (typeof PERIOD_KINDS)[number]

export const periodForm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DAY'), day: isoDate }),
  z.object({ kind: z.literal('WEEK'), day: isoDate }),
  z.object({ kind: z.literal('MONTH'), year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }),
  z.object({ kind: z.literal('SEASON'), year: z.coerce.number().int() }),
])

export type PeriodInput = z.output<typeof periodForm>

export interface RevenueBySource { source: string, totalPence: number }

// Every figure derived from ledger rows (criterion 2): comps and discounts are I-103's own
// foregone-value figure over the same range, never a second account of it.
export interface SeasonSummary {
  fromDay: string
  toDay: string
  revenueBySource: RevenueBySource[]
  refundsPence: number
  compsPence: number
  discountsPence: number
  openVariancePence: number
}
