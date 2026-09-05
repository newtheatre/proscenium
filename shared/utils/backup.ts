import { z } from 'zod'
import { startOfLondonDay } from './london'

// K-108, J-107: the restore drill. An outcome the estate does not use is refused rather than
// widened, so a typo cannot invent a third state nothing reads (K-108 criterion 3).
export const DRILL_OUTCOMES = ['PASS', 'FAIL'] as const
export type DrillOutcome = (typeof DRILL_OUTCOMES)[number]

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the date as YYYY-MM-DD')

// A drill records what it reconciled whether it passed or failed: a failure is the finding, not
// a reason to omit it (K-108 criterion 3, J-107 criterion 3).
export const restoreDrillForm = z.object({
  ranAt: civilDate,
  outcome: z.enum(DRILL_OUTCOMES),
  timeToRestoreMinutes: z.number().int().positive(),
  rowCountsMatch: z.boolean(),
  moneyTotalsMatch: z.boolean(),
  notes: z.string().trim().min(1).max(500).optional(),
})

export type RestoreDrillForm = z.infer<typeof restoreDrillForm>

// No cadence configured answers nothing rather than guessing one (0019); no drill ever run is
// always overdue once a cadence exists (J-107 criterion 4).
export function isDrillOverdue(lastDrillAt: string | null, intervalDays: number | null, now: string): boolean {
  if (intervalDays === null) return false
  if (lastDrillAt === null) return true
  const elapsedDays = (startOfLondonDay(now).getTime() - startOfLondonDay(lastDrillAt).getTime()) / 86_400_000
  return elapsedDays > intervalDays
}
