import type { StockUnit } from '#shared/utils/bar'

// What the suggested order list reads: live on-hand against par, advisory only (F-120).

export interface OrderListRow {
  id: string
  name: string
  unit: StockUnit
  category: string | null
  onHand: number
  parQty: number
  shortfall: number
}

export interface UnconfiguredRow {
  id: string
  name: string
  category: string | null
}
