import { z } from 'zod'
import { ENTRY_SOURCES, LINE_KINDS } from './ledger'
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
  nominalCode: z.string().trim().min(1).max(50).nullable(),
}).refine(input => isKnownPair(input.kind, input.source), {
  path: ['source'], message: 'No ledger line ever posts under that kind and source together',
})

export type NominalMappingInput = z.output<typeof nominalMappingForm>

export const exportRangeForm = z.object({
  fromDay: londonDay,
  toDay: londonDay,
}).refine(input => input.toDay >= input.fromDay, { path: ['toDay'], message: 'The range ends before it starts' })

export type ExportRangeInput = z.output<typeof exportRangeForm>

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
