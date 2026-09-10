import { z } from 'zod'

// Reconciliation to the expected SumUp Z figure (F-118): every figure is a fresh query over the
// ledger for the show night, never a stored total, the same discipline F-119's reports keep.

export interface BarReconciliation {
  night: string
  cardSalesPence: number
  tabSettlementsPence: number
  compsCount: number
  compsForegonePence: number
  discountsPence: number
  refundsPence: number
  tabChargesPence: number
  expectedPence: number
}

// What the desk took the same night, alongside the bar's own figure (criterion 1). Bar and desk
// share the one physical reader (0005), so this is what the two sum to.
export interface NightReconciliation {
  bar: BarReconciliation
  deskTakingsPence: number
  wholeNightExpectedPence: number
}

const pence = z.number().int().min(0)

// The officer keys in what the reader actually shows; the expected figure is never sent by the
// client, only recomputed server-side at the moment of close (0005's cross-check, the other way
// round: the server's own figure is what a mismatch is judged against).
export const closeTillSessionForm = z.object({
  id: z.string().trim().min(1, 'Which session to close'),
  actualZPence: pence,
  // Required only when the reader disagrees with the ledger; the route enforces that half, since
  // whether they disagree is only known once the expected figure is recomputed (criterion 3).
  varianceNote: z.string().trim().min(1).max(500).optional(),
})

export type CloseTillSessionInput = z.output<typeof closeTillSessionForm>
