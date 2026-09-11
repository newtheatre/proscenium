import { plural } from './text'

// What the show screen's status strip says (D-132 criterion 2). Every figure is paired with the
// words for it, because a colour on its own is not a state (K-101).

export function saysOnSale(onSaleCount: number, performanceCount: number): string {
  if (performanceCount === 0) return 'No performances'
  return onSaleCount === 0 ? 'Nothing on sale' : 'On sale'
}

export function saysOnSaleCount(onSaleCount: number, performanceCount: number): string {
  if (performanceCount === 0) return 'None scheduled yet'
  return `${onSaleCount} of ${plural(performanceCount, 'performance', 'performances')}`
}

export function saysHouse(soldTickets: number, capacity: number): string {
  return capacity === 0 ? 'No capacity set' : `${soldTickets} of ${plural(capacity, 'seat')}`
}

// Null where there is no house to measure against, which is what a meter with no maximum would
// otherwise draw as nought.
export function soldShare(soldTickets: number, capacity: number): number | null {
  if (capacity <= 0) return null
  return Math.min(Math.round((soldTickets / capacity) * 100), 100)
}

export function saysUnpaid(unpaidTickets: number): string {
  return unpaidTickets === 0 ? 'Nothing owed' : 'Awaiting payment at the desk'
}
