import { z } from 'zod'
import { describeKind, ENTRY_SOURCES, LINE_KINDS, saysTender, totalOf } from './ledger'
import type { EntrySource, LineKind, Tender } from './ledger'

// I-108. A period export categorised for the SU's own accounting: every row but the last is a
// ledger line's own signed pence (I-106), and the last totals the file's card lines (I-105).

const londonDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is YYYY-MM-DD')

// The (kind, source) pairs a ledger line can actually carry, architecture.md's own posting table;
// a pair added here needs a migration seeding its `su_nominal_mappings` row (issue #1283).
export const LEDGER_POSTING_PAIRS: readonly { kind: LineKind, source: EntrySource }[] = [
  { kind: 'TICKET_COLLECTION', source: 'DESK' },
  { kind: 'TICKET_COLLECTION', source: 'TILL' },
  { kind: 'WALK_UP', source: 'DESK' },
  { kind: 'WALK_UP', source: 'TILL' },
  { kind: 'PASS_SALE', source: 'DESK' },
  { kind: 'PASS_SALE', source: 'SYSTEM' },
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

// The yearly return is re-runnable by name (criterion 4): a year, a season or a custom range, the
// shared period kinds (0087). A link with no kind, or kind=RANGE, predates that and is a range.
export const suExportForm = z.preprocess(
  input => (input && typeof input === 'object' && (!('kind' in input) || input.kind === 'RANGE') ? { ...input, kind: 'TERM' } : input),
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('TERM'), fromDay: londonDay, toDay: londonDay }),
    z.object({ kind: z.literal('YEAR'), year: z.coerce.number().int() }),
    z.object({ kind: z.literal('SEASON'), seasonId: z.string().trim().min(1, 'Choose a season') }),
  ]).refine(input => input.kind !== 'TERM' || input.toDay >= input.fromDay, { path: ['toDay'], message: 'The range ends before it starts' }),
)

export type SuExportPeriod = z.output<typeof suExportForm>

// The kinds the export screen offers, in its order; the dashboard's others make no SU return.
export const SU_EXPORT_KINDS = ['YEAR', 'SEASON', 'TERM'] as const

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
  tender: Tender
  nominalCode: string | null
  amountPence: number
}

// A plain decimal for a spreadsheet cell, never the £-prefixed display string `saysMoney` uses
// elsewhere: the SU's own accounting import parses this column as a number.
export function formatPoundsForExport(pence: number): string {
  return (pence / 100).toFixed(2)
}

// The file's last line: card money only, the one figure the money dashboard calls revenue (I-105).
export const SU_EXPORT_CARD_TOTAL = 'Card total, the same as the money dashboard\'s revenue'

// A drink charged to a tab is credit, and the same money comes back as a tab settlement; its own
// category keeps the two from reading as one sale made twice (issue #1363, F-109).
function exportCategory(row: SuExportRow): string {
  return row.kind === 'BAR_ITEM' && row.tender === 'TAB' ? 'Bar item on a tab' : describeKind(row.kind)
}

// The file's rows, shaped once so every run of the same lines is the same bytes (criterion 4).
export function suExportCsvRows(rows: SuExportRow[]): Record<string, unknown>[] {
  const cardPence = totalOf(rows.filter(row => row.tender === 'CARD'))
  return [
    ...rows.map(row => ({
      date: row.londonDay,
      category: exportCategory(row),
      tender: saysTender(row.tender),
      // The explicit unmapped line criterion 3 asks for, rather than a blank cell a spreadsheet
      // would silently sort past.
      nominalCode: row.nominalCode ?? 'UNMAPPED',
      amountPence: row.amountPence,
      amountPounds: formatPoundsForExport(row.amountPence),
    })),
    // No tender, so a filter on Card leaves the total out rather than counting it twice.
    {
      date: '',
      category: SU_EXPORT_CARD_TOTAL,
      tender: '',
      nominalCode: '',
      amountPence: cardPence,
      amountPounds: formatPoundsForExport(cardPence),
    },
  ]
}
