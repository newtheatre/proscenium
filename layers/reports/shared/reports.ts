// What a ready-made report is, shared by the server and the page.
export const AREAS = ['box-office', 'front-of-house', 'bar', 'training', 'money', 'membership', 'year'] as const
export type Area = typeof AREAS[number]

export const SCOPE_KINDS = ['none', 'season', 'production', 'venue'] as const
export type ScopeKind = typeof SCOPE_KINDS[number]

/** How a report's dates are worked out, in the theatre's show nights. */
export const PERIOD_RULES = ['scope', 'last-week', 'last-month', 'committee-year', 'last-committee-year', 'chosen'] as const
export type PeriodRule = typeof PERIOD_RULES[number]

/** The breakdowns a report page offers, each a shared key with a name the page can show. */
export const PAGE_BREAKDOWNS = ['performance', 'production', 'season', 'venue', 'day', 'month'] as const
export type PageBreakdown = typeof PAGE_BREAKDOWNS[number]

export interface ReadyMade {
  id: string
  label: string
  description: string
  area: Area
  scope: ScopeKind
  period: PeriodRule
  breakdown?: string
  figures: string[]
  chart?: 'bar' | 'line'
  ability: string
  order?: number
}

export interface FigureColumn {
  id: string
  label: string
  unit: 'count' | 'money' | 'minutes' | 'percent'
  combine: 'sum' | 'distinct' | 'level'
  by: string[]
  /** False when the reader lacks its ability: the page leaves it out and says how many were (M3). */
  readable: boolean
}

export interface ReportView {
  report: ReadyMade
  module: string
  figures: FigureColumn[]
  /** The breakdowns every readable figure offers, of those the page can name. */
  breakdowns: PageBreakdown[]
  period: { rule: PeriodRule, from: string, to: string }
  scope: { kind: ScopeKind, id: string | null, title: string | null }
}

export type FigureAnswer
  = | { state: 'ok', rows: { keys: Record<string, string>, value: number, currency?: string }[], labels: Record<string, string>, starts?: Record<string, number> }
    | { state: 'unavailable', reason: string }
    | { state: 'unsupported' }
    | { state: 'hidden' }
