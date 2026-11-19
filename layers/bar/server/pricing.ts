// The price rules (tab 3, "Price lists"), with no database: the newest price in force on a list
// wins, and a variant with no price there uses Standard's when the list falls back. A percentage off
// a list is a promotion (the unified promotions design), not a list.

export interface PriceRow { id: string, variantId: string, priceListId: string, amountMinor: number | null, effectiveFrom: number }
export interface ListRule { id: string, fallsBack: boolean }
export interface Priced { amountMinor: number, priceId: string, from: 'list' | 'standard' }

/** The row in force for a variant on a list at a moment: the latest that has started, the later id on a tie. */
export function inForce(rows: PriceRow[], variantId: string, listId: string, at: number): PriceRow | null {
  let best: PriceRow | null = null
  for (const r of rows) {
    if (r.variantId !== variantId || r.priceListId !== listId || r.effectiveFrom > at) continue
    if (!best || r.effectiveFrom > best.effectiveFrom || (r.effectiveFrom === best.effectiveFrom && r.id > best.id)) best = r
  }
  return best
}

/** The next change after a moment, for showing a planned rise. */
export function nextChange(rows: PriceRow[], variantId: string, listId: string, at: number): PriceRow | null {
  let best: PriceRow | null = null
  for (const r of rows) {
    if (r.variantId !== variantId || r.priceListId !== listId || r.effectiveFrom <= at) continue
    if (!best || r.effectiveFrom < best.effectiveFrom || (r.effectiveFrom === best.effectiveFrom && r.id > best.id)) best = r
  }
  return best
}

/** What a variant sells for on a list at a moment, or null when it cannot be sold from that list. */
export function priceOn(rows: PriceRow[], variantId: string, list: ListRule, standardId: string, at: number): Priced | null {
  const own = inForce(rows, variantId, list.id, at)
  if (own && own.amountMinor !== null) return { amountMinor: own.amountMinor, priceId: own.id, from: 'list' }
  if (list.id === standardId || !list.fallsBack) return null
  const row = inForce(rows, variantId, standardId, at)
  return row && row.amountMinor !== null ? { amountMinor: row.amountMinor, priceId: row.id, from: 'standard' } : null
}
