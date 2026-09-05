import { z } from 'zod'
import { MAX_MOVEMENT_QTY } from '#shared/utils/bar'
import type { StockUnit } from '#shared/utils/bar'

// A count captured at a moment, applied atomically to stock_movements. Blank and an entered zero
// are different states throughout (F-115 criterion 2).

export const STOCKTAKE_STATUSES = ['OPEN', 'APPLIED'] as const
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number]

export interface Stocktake {
  id: string
  status: StocktakeStatus
  openedBy: string
  openedAt: number
  appliedBy: string | null
  appliedAt: number | null
}

export interface StocktakeLine {
  id: string
  itemId: string
  itemName: string
  unit: StockUnit
  expectedQty: number
  // Null is uncounted. Variance and its cost are null with it, since neither means anything yet.
  countedQty: number | null
  variance: number | null
  varianceCostPence: number | null
}

export const stocktakeCountForm = z.object({
  itemId: z.string().trim().min(1),
  // Null clears a count back to blank; a negative count does not exist to enter.
  counted: z.number().int().nonnegative().max(MAX_MOVEMENT_QTY).nullable(),
})

export const stocktakeCountsForm = z.object({
  counts: z.array(stocktakeCountForm).min(1).max(200),
}).refine(
  value => new Set(value.counts.map(count => count.itemId)).size === value.counts.length,
  { message: 'A stocked item appears once per submission', path: ['counts'] },
)

export type StocktakeCountsInput = z.output<typeof stocktakeCountsForm>
