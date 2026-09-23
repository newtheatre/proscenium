import { z } from 'zod'

// The treasurer's money dashboard (I-105): every figure a query over the ledger, never stored.
// TERM carries its own range (I-107); SEASON names a seasons row whose days the server reads (0087).

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is YYYY-MM-DD')

export const PERIOD_KINDS = ['DAY', 'WEEK', 'MONTH', 'TERM', 'SEASON', 'YEAR'] as const
export type PeriodKind = (typeof PERIOD_KINDS)[number]

export const periodForm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DAY'), day: isoDate }),
  z.object({ kind: z.literal('WEEK'), day: isoDate }),
  z.object({ kind: z.literal('MONTH'), year: z.coerce.number().int(), month: z.coerce.number().int().min(1, 'Choose a month').max(12) }),
  z.object({ kind: z.literal('YEAR'), year: z.coerce.number().int() }),
  z.object({ kind: z.literal('TERM'), fromDay: isoDate, toDay: isoDate }),
  z.object({ kind: z.literal('SEASON'), seasonId: z.string().trim().min(1, 'Choose a season') }),
])

export type PeriodInput = z.output<typeof periodForm>

// Every kind whose range follows from the request alone; a season needs its row read first.
export type RangedPeriod = Exclude<PeriodInput, { kind: 'SEASON' }>

// One of the theatre's seasons as the money screens offer it: a name and its own days (0087).
export interface FinanceSeason { id: string, name: string, fromDay: string, toDay: string }

// A defined term as a period control offers it: a label and its range, nothing about who made it.
export interface TermChoice { id: string, label: string, fromDay: string, toDay: string }

// What a period control needs before it can offer TERM and SEASON (usePeriodForm).
export interface PeriodChoices { terms: TermChoice[], seasons: FinanceSeason[] }

// A period as the query string every period route parses back through `periodForm`.
export function periodQuery(period: PeriodInput): Record<string, string> {
  switch (period.kind) {
    case 'DAY':
    case 'WEEK':
      return { kind: period.kind, day: period.day }
    case 'MONTH':
      return { kind: period.kind, year: String(period.year), month: String(period.month) }
    case 'YEAR':
      return { kind: period.kind, year: String(period.year) }
    case 'TERM':
      return { kind: period.kind, fromDay: period.fromDay, toDay: period.toDay }
    case 'SEASON':
      return { kind: period.kind, seasonId: period.seasonId }
  }
}

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
