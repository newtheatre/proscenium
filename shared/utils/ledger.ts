import { z } from 'zod'
import { londonParts } from './london'

// Every monetary fact, in integer pence, appended and never edited (0004, 0010). The kind is a
// closed set held here rather than by a CHECK, which could never be widened (0033).

export const ENTRY_SOURCES = ['DESK', 'TILL', 'SELF_SERVE', 'IMPORT', 'SYSTEM'] as const
export const TENDERS = ['CARD', 'COMP', 'TAB', 'NONE'] as const

export type EntrySource = (typeof ENTRY_SOURCES)[number]
export type Tender = (typeof TENDERS)[number]

export const LINE_KINDS = [
  { name: 'TICKET_COLLECTION', label: 'Ticket collection' },
  { name: 'WALK_UP', label: 'Walk-up sale' },
  { name: 'BAR_ITEM', label: 'Bar item' },
  { name: 'PASS_SALE', label: 'Pass sale' },
  { name: 'TAB_SETTLEMENT', label: 'Tab settlement' },
  { name: 'REFUND', label: 'Refund' },
  { name: 'IMPORT', label: 'Imported history' },
] as const

export type LineKind = (typeof LINE_KINDS)[number]['name']

const KIND_NAMES = LINE_KINDS.map(kind => kind.name) as unknown as [LineKind, ...LineKind[]]

export function isLineKind(name: string): name is LineKind {
  return KIND_NAMES.includes(name as LineKind)
}

// A report groups by kind, so one nobody registered shows as itself rather than vanishing (0027).
export function describeKind(name: string): string {
  return LINE_KINDS.find(kind => kind.name === name)?.label ?? name
}

const pence = z.number().int()

export const lineForm = z.object({
  kind: z.enum(KIND_NAMES),
  // Gross, and negative on a reversal. Zero is a comp, which is a fact rather than an absence.
  amountPence: pence,
  qty: z.number().int().min(1).default(1),
  unitPricePence: pence.nullish(),
  reservationId: z.string().max(64).nullish(),
  performanceId: z.string().max(64).nullish(),
  ticketId: z.string().max(64).nullish(),
  productVariantId: z.string().max(64).nullish(),
  priceRef: z.string().max(200).nullish(),
  choices: z.record(z.string(), z.unknown()).nullish(),
})

export type LineInput = z.input<typeof lineForm>

export const entryForm = z.object({
  id: z.string().max(64).optional(),
  source: z.enum(ENTRY_SOURCES),
  tender: z.enum(TENDERS),
  actorId: z.string().max(64).nullish(),
  reversesEntryId: z.string().max(64).nullish(),
  compReason: z.string().max(200).nullish(),
  compApprovedBy: z.string().max(64).nullish(),
  tabDebtorId: z.string().max(64).nullish(),
  lines: z.array(lineForm).min(1, 'An entry itemises to at least one line'),
}).refine(
  entry => entry.id === undefined || entry.id !== entry.reversesEntryId,
  { path: ['reversesEntryId'], message: 'An entry cannot reverse itself' },
)

export type EntryInput = z.output<typeof entryForm>

// Never stored: a total is what its lines say, read at the moment it is asked for (criterion 4).
export function totalOf(lines: { amountPence: number, [key: string]: unknown }[]): number {
  return lines.reduce((sum, line) => sum + line.amountPence, 0)
}

export interface NettableEntry {
  id: string
  totalPence: number
  reversesEntryId: string | null
}

// Both the entry and everything correcting it stay visible; what is owed is the sum across them.
export function netPence(entries: NettableEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.totalPence, 0)
}

// Stored in UTC, grouped by the civil day in London, which is a different day for six months of
// the year (0014).
export function londonDayOf(at: Date): string {
  const { year, month, day } = londonParts(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
