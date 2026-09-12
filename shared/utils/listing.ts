import type { ListedShow } from './programme'

// What the listing says about a whole run, as against what `programme.ts` says about one house.
// Pure, so the sticker on a card and the test that pins it read the same function (J-111).

export type ListingFlag = 'Selling fast' | 'House full'

// Cancelled nights are not on offer and a closed window is not a sell-out, so neither counts
// towards the run being full (D-101).
export function listingFlag(listed: ListedShow): ListingFlag | null {
  const onSale = listed.performances.filter(one => !one.cancelled && one.availability !== 'BOOKING_CLOSED')
  if (onSale.length === 0) return null
  if (onSale.every(one => one.availability === 'SOLD_OUT')) return 'House full'
  return onSale.some(one => one.availability === 'LIMITED') ? 'Selling fast' : null
}

// A show with no artwork still needs a frame of its own, so the two hues come from a stable seed:
// the same show keeps its colours between loads and between machines, and no two neighbours match.
export function posterTint(seed: string): { from: number, to: number } {
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 360
  return { from: hash, to: (hash + 140) % 360 }
}

const GLYPHS = [
  'i-lucide-moon-star',
  'i-lucide-cog',
  'i-lucide-asterisk',
  'i-lucide-feather',
  'i-lucide-sparkle',
  'i-lucide-anchor',
] as const

// The corner mark on an artless frame, drawn from the same seed as the tint.
export function posterGlyph(seed: string): string {
  let hash = 0
  for (const character of seed) hash = (hash * 17 + character.charCodeAt(0)) % GLYPHS.length
  return GLYPHS[hash]!
}
