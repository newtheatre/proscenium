import { z } from 'zod'

// Settlement, itemisation and void of a tab charge (F-109). Nothing here writes anything; the
// write is server/utils/tab-settlement.ts's, gated the same way commitSale's cross-check is.

// Bounded, the same reasoning MAX_BASKET_LINES is: a settlement covers exactly the charges it
// names, never an unbounded sweep, and 0003 caps how many ids one statement may bind.
export const MAX_SETTLEMENT_CHARGES = 90

export const tabHolderScopeForm = z.object({
  venueId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
  holderId: z.string().trim().min(1),
})

export type TabHolderScopeInput = z.output<typeof tabHolderScopeForm>

export const settleTabForm = z.object({
  venueId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
  holderId: z.string().trim().min(1),
  // Captured by the screen at the moment it asked what was owed, so a charge landing after
  // cannot be swept in: the write is bounded to exactly these ids (criterion 3).
  entryIds: z.array(z.string().trim().min(1)).min(1, 'A settlement needs at least one charge').max(MAX_SETTLEMENT_CHARGES),
  expectedTotalPence: z.number().int().nonnegative(),
})

export type SettleTabInput = z.output<typeof settleTabForm>

export const VOID_REASON_LIMIT = 200

export const voidTabChargeForm = z.object({
  reason: z.string().trim().min(1, 'Say why, because a void needs a reason on the record').max(VOID_REASON_LIMIT),
})

export type VoidTabChargeInput = z.output<typeof voidTabChargeForm>

// One charge as the holder's own account, or the till's settlement screen, reads it: what it
// was for, and whether it has since been settled or voided.
export interface TabCharge {
  entryId: string
  happenedAt: number
  londonDay: string
  totalPence: number
  lines: { productName: string, variantLabel: string, qty: number, unitPricePence: number }[]
  settledAt: number | null
  voided: boolean
}

export interface ItemisedTab {
  holderId: string
  holderName: string
  outstandingPence: number
  charges: TabCharge[]
}
