import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import type { BarReconciliation } from './reconciliation'

// The daily reconciliation record (I-104): a night, not a calendar day, is what the reader is
// read against (F-118, architecture.md); this is the whole-night figure that reconciliation reads.

const night = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A night is YYYY-MM-DD')
const pence = z.number().int().nonnegative()

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
  readerPence: pence,
  // Required only when the reader disagrees with the ledger; the route enforces that half, since
  // whether they disagree is only known once the expected figure is recomputed (criterion 3).
  note: z.string().trim().min(1).max(500).optional(),
  // The reading this one resolves: a correction (a different readerPence) or a write-off (the
  // same one, accepted rather than restated) both name what they resolve (criterion 4).
  supersedesId: z.string().trim().min(1).optional(),
  writtenOff: z.boolean().default(false),
})

export type RecordZReadingInput = z.output<typeof recordZReadingForm>

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
