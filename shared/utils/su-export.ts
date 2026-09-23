import { z } from 'zod'
import { describeKind, ENTRY_SOURCES, LINE_KINDS } from './ledger'
import type { EntrySource, LineKind } from './ledger'

// I-108. A period export categorised for the SU's own accounting, never a total this module
// invents: every figure is a ledger line's own signed pence, read straight off the row (I-106).

const londonDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is YYYY-MM-DD')

// The (kind, source) pairs a ledger line can actually carry, architecture.md's own posting
// table. Seeds `su_nominal_mappings` and is what a mapping change is validated against.
export const LEDGER_POSTING_PAIRS: readonly { kind: LineKind, source: EntrySource }[] = [
  { kind: 'TICKET_COLLECTION', source: 'DESK' },
  { kind: 'WALK_UP', source: 'DESK' },
  { kind: 'PASS_SALE', source: 'DESK' },
  { kind: 'PASS_ADMISSION', source: 'DESK' },
  { kind: 'PASS_ADMISSION', source: 'SELF_SERVE' },
  { kind: 'BAR_ITEM', source: 'TILL' },
  { kind: 'TAB_SETTLEMENT', source: 'TILL' },
  { kind: 'REFUND', source: 'DESK' },
  { kind: 'IMPORT', source: 'IMPORT' },
]

function isKnownPair(kind: string, source: string): boolean {
  return LEDGER_POSTING_PAIRS.some(pair => pair.kind === kind && pair.source === source)
}

// A structural bound on the export, not a policy one, so it is a constant and not a setting
// (0012), the same reasoning D-129's ticket export cap already applies.
export const SU_EXPORT_ROW_CAP = 20_000

export const nominalMappingForm = z.object({
  kind: z.enum(LINE_KINDS.map(one => one.name) as [LineKind, ...LineKind[]]),
  source: z.enum(ENTRY_SOURCES),
  // Cleared back to unmapped with an explicit null, never an empty string (criterion 3).
  nominalCode: z.string().trim().min(1, 'Give it a nominal code').max(50).nullable(),
}).refine(input => isKnownPair(input.kind, input.source), {
  path: ['source'], message: 'No ledger line ever posts under that kind and source together',
})

export type NominalMappingInput = z.output<typeof nominalMappingForm>

export const exportRangeForm = z.object({
  fromDay: londonDay,
  toDay: londonDay,
}).refine(input => input.toDay >= input.fromDay, { path: ['toDay'], message: 'The range ends before it starts' })

export type ExportRangeInput = z.output<typeof exportRangeForm>

// The yearly return is re-runnable by name (criterion 4): a year or a season row, resolved on the
// server exactly as the money dashboard resolves them (0087). No kind at all is a custom range.
export const suExportForm = z.preprocess(
  input => (input && typeof input === 'object' && !('kind' in input) ? { ...input, kind: 'RANGE' } : input),
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('RANGE'), fromDay: londonDay, toDay: londonDay }),
    z.object({ kind: z.literal('YEAR'), year: z.coerce.number().int() }),
    z.object({ kind: z.literal('SEASON'), seasonId: z.string().trim().min(1, 'Choose a season') }),
  ]).refine(input => input.kind !== 'RANGE' || input.toDay >= input.fromDay, { path: ['toDay'], message: 'The range ends before it starts' }),
)

export type SuExportPeriod = z.output<typeof suExportForm>

// The query string both the download and its coverage read, so the two never describe different days.
export function suExportParams(period: SuExportPeriod): Record<string, string> {
  if (period.kind === 'YEAR') return { kind: 'YEAR', year: String(period.year) }
  if (period.kind === 'SEASON') return { kind: 'SEASON', seasonId: period.seasonId }
  return { kind: 'RANGE', fromDay: period.fromDay, toDay: period.toDay }
}

// What the screen shows before the download: the days a choice resolves to, whether they are
// closed (so two runs match), and whether the file would pass the cap.
export interface SuExportCoverage {
  fromDay: string
  toDay: string
  rows: number
  closed: boolean
}

const britishDigits = new Intl.NumberFormat('en-GB')

export function suExportLines(rows: number): string {
  return `${britishDigits.format(rows)} ${rows === 1 ? 'line' : 'lines'}`
}

export function suExportCapRefusal(): string {
  return `This export would return more than ${britishDigits.format(SU_EXPORT_ROW_CAP)} `
    + 'rows. Narrow the date range and try again.'
}

export interface NominalMapping {
  kind: LineKind
  source: EntrySource
  nominalCode: string | null
  updatedByName: string | null
  updatedAt: number | null
}

export interface SuExportRow {
  londonDay: string
  kind: LineKind
  source: EntrySource
  nominalCode: string | null
  amountPence: number
}

// A plain decimal for a spreadsheet cell, never the £-prefixed display string `saysMoney` uses
// elsewhere: the SU's own accounting import parses this column as a number.
export function formatPoundsForExport(pence: number): string {
  return (pence / 100).toFixed(2)
}

// The file's rows, shaped once so every run of the same lines is the same bytes (criterion 4).
export function suExportCsvRows(rows: SuExportRow[]): Record<string, unknown>[] {
  return rows.map(row => ({
    date: row.londonDay,
    category: describeKind(row.kind),
    // The explicit unmapped line criterion 3 asks for, rather than a blank cell a spreadsheet
    // would silently sort past.
    nominalCode: row.nominalCode ?? 'UNMAPPED',
    amountPence: row.amountPence,
    amountPounds: formatPoundsForExport(row.amountPence),
  }))
}
