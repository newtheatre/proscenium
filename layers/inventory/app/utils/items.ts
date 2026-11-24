// How an item's state reads in a badge: always a word, the tone only adds to it.
import type { ItemState } from '../../shared/states'

export const ITEM_STATE_TONE: Record<ItemState, 'success' | 'warning' | 'danger' | 'neutral'> = { 'active': 'success', 'out-of-service': 'warning', 'missing': 'danger', 'disposed': 'neutral' }

// A label's QR code holds the item's address (spec part 2); a typed tag or a barcode holds the tag.
export function readLabel(code: string): { itemId: string } | { tag: string } {
  const at = /\/console\/inventory\/items\/([^/?#]+)/.exec(code)
  return at ? { itemId: decodeURIComponent(at[1]!) } : { tag: code.trim().toUpperCase() }
}

export const itemAddress = (origin: string, id: string) => `${origin}/console/inventory/items/${encodeURIComponent(id)}`
