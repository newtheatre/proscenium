// The price rules (tab 3, "Price lists"), with no database: the newest price in force on a list
// wins; a variant with no price there uses Standard's when the list falls back; a percentage list has
// no prices of its own and takes Standard's less its percentage, to the nearest minor unit with
// halves rounded up.

export interface PriceRow { id: string, variantId: string, priceListId: string, amountMinor: number | null, effectiveFrom: number }
export interface ListRule { id: string, percentOff: number | null, fallsBack: boolean }
export interface Priced { amountMinor: number, priceId: string, from: 'list' | 'standard' | 'percent' }

const PERCENT = 100 // not-policy: a percentage is out of a hundred

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

/** Standard's amount less a percentage, halves rounded up: 4.50 at 25% off is 3.38. */
export function lessPercent(amountMinor: number, percentOff: number): number {
  return Math.floor((amountMinor * (PERCENT - percentOff) + PERCENT / 2) / PERCENT)
}

/** What a variant sells for on a list at a moment, or null when it cannot be sold from that list. */
export function priceOn(rows: PriceRow[], variantId: string, list: ListRule, standardId: string, at: number): Priced | null {
  const standard = () => {
    const row = inForce(rows, variantId, standardId, at)
    return row && row.amountMinor !== null ? row as PriceRow & { amountMinor: number } : null
  }
  if (list.id !== standardId && list.percentOff !== null) {
    const row = standard()
    return row ? { amountMinor: lessPercent(row.amountMinor, list.percentOff), priceId: row.id, from: 'percent' } : null
  }
  const own = inForce(rows, variantId, list.id, at)
  if (own && own.amountMinor !== null) return { amountMinor: own.amountMinor, priceId: own.id, from: 'list' }
  if (list.id === standardId || !list.fallsBack) return null
  const row = standard()
  return row ? { amountMinor: row.amountMinor, priceId: row.id, from: 'standard' } : null
}
