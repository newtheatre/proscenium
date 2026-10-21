import type { StockUnit } from '#shared/utils/bar'

// What the suggested order list reads: live on-hand against par, advisory only (F-120).

export interface OrderListRow {
  id: string
  name: string
  unit: StockUnit
  containerMl: number | null
  category: string | null
  onHand: number
  parQty: number
  shortfall: number
}

// What to ask a supplier for: whole items, or whole containers rounded up, since nobody orders 1275
// ml of wine (0140). Null where a measured item has no container size to count in.
export function toOrder(row: Pick<OrderListRow, 'unit' | 'containerMl' | 'shortfall'>): number | null {
  if (row.unit === 'ITEM') return row.shortfall
  return row.containerMl ? Math.ceil(row.shortfall / row.containerMl) : null
}

export function saysToOrder(row: Pick<OrderListRow, 'unit' | 'containerMl' | 'shortfall'>): string {
  const count = toOrder(row)
  if (count === null) return `${row.shortfall} ml`
  return row.unit === 'ITEM' ? `${count}` : `${count} × ${row.containerMl} ml`
}

export interface UnconfiguredRow {
  id: string
  name: string
  category: string | null
}
