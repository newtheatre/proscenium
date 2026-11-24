// How an item's state reads in a badge: always a word, the tone only adds to it.
import type { ItemState } from '../../shared/states'

export const ITEM_STATE_TONE: Record<ItemState, 'success' | 'warning' | 'danger' | 'neutral'> = { 'active': 'success', 'out-of-service': 'warning', 'missing': 'danger', 'disposed': 'neutral' }

// A scanned label holds the tag, or an address ending in it; either finds the item.
export const tagOf = (code: string) => decodeURIComponent(code.trim().split('/').pop() ?? '').toUpperCase()
