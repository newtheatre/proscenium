// Swapping tickets for a pass on Choose tickets (Matt, 18 and 19 November). Each ticket swapped
// comes off its ticket's count, and the reference typed for it, such as a student ID, comes across to
// the pass, so it is not asked for twice. Each one given back returns to the part of the house it came
// from, with its reference. Counts and references are keyed "<bandId> <ticketTypeId>".
import type { PassSwap } from '../components/BoxOfficePassSwap.vue'

export interface SwapState { counts: Record<string, number>, references: Record<string, string[]>, swaps: PassSwap[] }

/** The state with `n` of a kind of ticket swapped for a pass price. `lines` are the chosen lines' keys, in order: the last is taken first. */
export function swapTickets(state: SwapState, lines: readonly string[], row: Omit<PassSwap, 'count' | 'references' | 'bands'>, n: number): SwapState {
  const same = (s: PassSwap) => s.passTypeId === row.passTypeId && s.passPriceId === row.passPriceId && s.ticketTypeId === row.ticketTypeId
  const swap = state.swaps.find(same)
  const bands = [...(swap?.bands ?? [])]
  const refs = [...(swap?.references ?? [])]
  const counts = { ...state.counts }
  const references = { ...state.references }
  const keyFor = (bandId: string) => `${bandId} ${row.ticketTypeId}`
  while (bands.length < n) {
    const key = [...lines].reverse().find(k => k.endsWith(` ${row.ticketTypeId}`) && (counts[k] ?? 0) > 0)
    if (!key) break
    const left = counts[key]! - 1
    counts[key] = left
    const typed = references[key] ?? []
    refs[bands.length] = typed[left]?.trim() || refs[bands.length] || ''
    references[key] = typed.slice(0, left)
    bands.push(key.slice(0, key.length - row.ticketTypeId.length - 1))
  }
  while (bands.length > n) {
    const key = keyFor(bands.pop()!)
    const had = counts[key] ?? 0
    counts[key] = had + 1
    const typed = [...(references[key] ?? [])]
    typed[had] = refs[bands.length] ?? ''
    references[key] = typed
  }
  const others = state.swaps.filter(s => !same(s))
  return { counts, references, swaps: bands.length ? [...others, { ...row, count: bands.length, references: refs.slice(0, bands.length), bands }] : others }
}
