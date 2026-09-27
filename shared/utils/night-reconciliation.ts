import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import { isShowNight } from './show-night'
import type { BarReconciliation } from './reconciliation'

// The daily reconciliation record (I-104): a night, not a calendar day, is what the reader is
// read against (F-118, architecture.md); this is the whole-night figure that reconciliation reads.

const NIGHT = /^\d{4}-\d{2}-\d{2}$/

// A real London date as well as the shape: 2026-13-45 is no night, and is refused here (0014).
const night = z.string().regex(NIGHT, 'A night is YYYY-MM-DD').refine(isShowNight, 'That is not a real date')
const pence = z.number().int().nonnegative()

// The reconciliation route's own query: one night, validated the same way a reading's is.
export const zNightQuery = z.object({ night })

export interface ExpectedByKind { kind: string, totalPence: number }

// Split by source (criterion 1): the desk's own breakdown, alongside the bar's, which F-118's
// own `BarReconciliation` already itemises into card sales, tab settlements, comps and discounts.
export interface NightExpected {
  night: string
  deskByKind: ExpectedByKind[]
  deskCompsPence: number
  deskDiscountsPence: number
  deskTakingsPence: number
  bar: BarReconciliation
  expectedPence: number
}

export interface ZReading {
  id: string
  night: string
  readerPence: number
  expectedPence: number
  variancePence: number
  enteredBy: string
  enteredByName: string
  note: string | null
  supersedesId: string | null
  writtenOff: boolean
  createdAt: number
}

// The reader keys in what it shows; the expected figure is recomputed server-side and never
// trusted from an earlier preview read (0005), the same discipline F-118's till close keeps.
export const recordZReadingForm = z.object({
  night,
  // A write-off accepts the reading it resolves as it stands, so it carries no figure of its own
  // and the route reads it back (criterion 4, issue 1360).
  readerPence: pence.optional(),
  // Required only when the reader disagrees with the ledger; the route enforces that half, since
  // whether they disagree is only known once the expected figure is recomputed (criterion 3).
  note: z.string().trim().min(1, 'Say why the reader and the ledger disagree').max(500).optional(),
  // The reading this one resolves: a correction (a different readerPence) or a write-off (the
  // same one, accepted rather than restated) both name what they resolve (criterion 4).
  supersedesId: z.string().trim().min(1, 'Say which reading this resolves').optional(),
  writtenOff: z.boolean().default(false),
  // What the screen showed as expected: a write-off sends it, and a figure moved since refuses.
  expectedPence: z.number().int().optional(),
}).refine(input => input.writtenOff || input.readerPence !== undefined, {
  path: ['readerPence'],
  message: 'Give the figure the reader shows',
})

export type RecordZReadingInput = z.output<typeof recordZReadingForm>

// What the statement writes: the figure resolved, typed or read back from what a write-off resolves.
export type ZReadingWrite = Omit<RecordZReadingInput, 'readerPence'> & { readerPence: number }

// A night named in the address, as a listed night links to; anything else opens on the fallback.
export function nightFromQuery(value: unknown, fallback: string): string {
  const named = Array.isArray(value) ? value[0] : value
  return typeof named === 'string' && isShowNight(named) ? named : fallback
}

// How many of the listed nights fall in a range, both ends inclusive: the dashboard's own days.
export function nightsWithin(nights: readonly OutstandingNight[], fromDay: string, toDay: string): number {
  return nights.filter(({ night }) => night >= fromDay && night <= toDay).length
}

export function reconciliationHref(night: string): string {
  return `/money/reconciliation?night=${night}`
}

// Reader less expected, the same sign the recorded variance carries; nothing until a figure is typed.
export function liveVariance(readerPence: number | null, expectedPence: number): number | null {
  return readerPence === null ? null : readerPence - expectedPence
}

export interface NightNeedingYou { night: string, says: 'No reading' | 'Open variance' }

// One list, oldest first: a night has either no reading or a live one with a variance, never both.
export function nightsNeedingYou(outstanding: { missing: OutstandingNight[], openVariance: OutstandingNight[] }): NightNeedingYou[] {
  return [
    ...outstanding.missing.map(({ night }) => ({ night, says: 'No reading' as const })),
    ...outstanding.openVariance.map(({ night }) => ({ night, says: 'Open variance' as const })),
  ].sort((a, b) => a.night.localeCompare(b.night))
}

export interface OutstandingNight { night: string }

// What a refused write reads as: SQLite names the unique index's own column (0047).
export const Z_READING_CONSTRAINT_REFUSALS: { violated: string, says: string }[] = [
  {
    violated: 'z_readings.night',
    says: 'Somebody else just recorded this night\'s first reading; resolve it instead of adding another',
  },
  {
    violated: 'z_readings.supersedes_id',
    says: 'That reading already has a correction or a write-off resolving it',
  },
]

export function zReadingConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(Z_READING_CONSTRAINT_REFUSALS, error)
}
