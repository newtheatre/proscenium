import { z } from 'zod'
import { MAX_MOVEMENT_QTY, saysQuantity } from '#shared/utils/bar'
import type { StockUnit } from '#shared/utils/bar'

// A count captured at a moment, applied atomically to stock_movements. Blank and an entered zero
// are different states throughout (F-115 criterion 2).

export const STOCKTAKE_STATUSES = ['OPEN', 'APPLIED'] as const
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number]

export function saysStocktakeStatus(status: StocktakeStatus): string {
  return status === 'OPEN' ? 'Open' : 'Applied'
}

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
  // The size a measured item is counted in, full ones plus the open one (issue 1321).
  containerMl: number | null
  // The stock group the count walks the bar by, or null where none is set.
  category: string | null
  expectedQty: number
  // Null is uncounted. Variance and its cost are null with it, since neither means anything yet.
  countedQty: number | null
  variance: number | null
  varianceCostPence: number | null
}

export const stocktakeCountForm = z.object({
  itemId: z.string().trim().min(1, 'A stocktake line is about a stocked item'),
  // Null clears a count back to blank; a negative count does not exist to enter.
  counted: z.number().int().nonnegative().max(MAX_MOVEMENT_QTY).nullable(),
})

export const stocktakeCountsForm = z.object({
  counts: z.array(stocktakeCountForm).min(1, 'A stocktake needs at least one line').max(200),
}).refine(
  value => new Set(value.counts.map(count => count.itemId)).size === value.counts.length,
  { message: 'A stocked item appears once per submission', path: ['counts'] },
)

export type StocktakeCountsInput = z.output<typeof stocktakeCountsForm>

// Issue 1321: a measured item is counted as full containers plus what is left in the open one, and
// stored in its own unit. Nothing typed in either is uncounted, never nought (F-115 criterion 2).
export function joinCount(full: number | undefined, part: number | undefined, containerMl: number): number | null {
  if (full === undefined && part === undefined) return null
  return (full ?? 0) * containerMl + (part ?? 0)
}

export function splitCount(qty: number, containerMl: number): { full: number, part: number } {
  return { full: Math.floor(qty / containerMl), part: qty % containerMl }
}

// Both ways at once, so nobody works the millilitres out by hand.
export function saysCount(qty: number, unit: StockUnit, containerMl: number | null): string {
  if (unit !== 'ML' || !containerMl) return saysQuantity(qty, unit)
  const { full, part } = splitCount(qty, containerMl)
  return `${full} full${part ? ` and ${part} ml open` : ''}, ${saysQuantity(qty, unit)}`
}

export const NO_STOCK_GROUP = 'No stock group'

export interface StocktakeGroup {
  name: string
  lines: StocktakeLine[]
}

// One section per stock group, in the order the lines arrive (grouped already by the query).
export function stocktakeGroups(lines: readonly StocktakeLine[]): StocktakeGroup[] {
  const groups: StocktakeGroup[] = []
  for (const line of lines) {
    const name = line.category ?? NO_STOCK_GROUP
    const last = groups.at(-1)
    if (last?.name === name) last.lines.push(line)
    else groups.push({ name, lines: [line] })
  }
  return groups
}
