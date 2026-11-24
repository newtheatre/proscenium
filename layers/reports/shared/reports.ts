// What a report is, shared by the server and the page: a ready-made report from a module, or one
// saved by someone here, both drawn as a question (scope, dates, breakdown) and its columns.
import type { Unit } from './formula'

export const AREAS = ['box-office', 'front-of-house', 'bar', 'training', 'money', 'membership', 'year'] as const
export type Area = typeof AREAS[number]

export const SCOPE_KINDS = ['none', 'season', 'production', 'venue'] as const
export type ScopeKind = typeof SCOPE_KINDS[number]

/** How a report's dates are worked out, in the theatre's show nights. */
export const PERIOD_RULES = ['scope', 'last-week', 'last-month', 'committee-year', 'last-committee-year', 'chosen'] as const
export type PeriodRule = typeof PERIOD_RULES[number]

/** Shared keys a page can name; a pivot goes across one of these only (B2). */
export const PAGE_BREAKDOWNS = ['performance', 'production', 'season', 'venue', 'space', 'day', 'month'] as const
export type PageBreakdown = typeof PAGE_BREAKDOWNS[number]

/** A breakdown down the side: a shared key, or a module's own `<module>.<noun>` that it labels through reports.key. */
export type RowKey = string
export const MODULE_KEY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/
export const isPageBreakdown = (key: string): key is PageBreakdown => (PAGE_BREAKDOWNS as readonly string[]).includes(key)

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
  kind: 'figure'
  id: string
  label: string
  unit: Unit
  combine: 'sum' | 'distinct' | 'level'
  by: string[]
  filters: string[]
  /** False when the reader lacks its ability: the page leaves it out and says how many were (M3). */
  readable: boolean
  /** No module offers it any longer (D3): the page says so and offers to remove it. */
  gone?: boolean
}

/** A column worked out from earlier ones (B3 to B5); its label is the maker's own words. */
export interface FormulaColumn { kind: 'formula', formula: string, label: string, unit: Unit }

export type ReportColumn = FigureColumn | FormulaColumn

/** Words that are either a catalogue key (a ready-made report's) or someone's own text (a saved report's). */
export type Words = { key: string } | { text: string }

export interface ReportView {
  source: 'ready-made' | 'saved'
  id: string
  name: Words
  description: Words | null
  /** The module a ready-made report comes from. */
  module?: string
  scopeKind: ScopeKind
  periodRule: PeriodRule
  /** The breakdown the report starts with. */
  usualBy: string | null
  chart: 'bar' | 'line' | null
  columns: ReportColumn[]
  /** The keys down the side that every readable figure offers. */
  breakdowns: string[]
  /** A saved report's pivot (B2) and filter (B6). */
  acrossBy: string | null
  filter: { key: string, values: string[], labels: Record<string, string> } | null
  /** A module key's label, as a catalogue key, for each module key the page may show. */
  keyLabels: Record<string, string>
  period: { rule: PeriodRule, from: string, to: string }
  scope: { kind: ScopeKind, id: string | null, title: string | null }
  saved: { editable: boolean, basedOn: string | null, shareRole: string | null, archived: boolean } | null
}

export type FigureAnswer
  = | { state: 'ok', rows: { keys: Record<string, string>, value: number, currency?: string }[], labels: Record<string, string>, starts?: Record<string, number> }
    | { state: 'unavailable', reason: string }
    | { state: 'unsupported' }
    | { state: 'hidden' }

/** A saved report's column as stored: a figure by its id, or a formula with its own label and unit. */
export type StoredColumn = { measure: string } | { formula: string, label: string, unit: Unit }
