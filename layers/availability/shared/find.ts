// Find a time's arithmetic (rules F3 and F5), shared by the server, which ranks best times, and the
// grid, which counts each cell. Times are minutes past local midnight; a day's pieces cover it whole.
import { pieceAt, type Piece } from './grid'
import type { ShownLevel } from './levels'

export const BEST_MAX = 10 // not-policy: rule F3 lists ten
export const SLOTS_MIN = 2 // not-policy: rule F7's shortlist
export const SLOTS_MAX = 6 // not-policy: rule F7's shortlist

/** One person's levels: date to that day's pieces. */
export type Week = Record<string, Piece[]>
export interface Span { start: number, end: number }
export interface Slot { date: string, start: number, end: number, free: number, maybe: number, unknown: number, busy: number }

const WORST: ShownLevel[] = ['free', 'unknown', 'maybe', 'busy']

/** The person's worst level over [start, end): busy over maybe over unknown over free. */
export function worstBetween(pieces: Piece[], start: number, end: number): ShownLevel {
  let worst = 0
  for (let m = start; m < end;) {
    const p = pieceAt(pieces, m)
    if (!p) return 'unknown'
    worst = Math.max(worst, WORST.indexOf(p.level))
    m = p.end
  }
  return WORST[worst]!
}

/** F4: a commitment laid over a person's day where it is worse than what they said; the rest is untouched. */
export function overlay(pieces: Piece[], span: Span, level: 'busy' | 'maybe', commitment: string): Piece[] {
  const out: Piece[] = []
  for (const p of pieces) {
    if (p.end <= span.start || span.end <= p.start) {
      out.push(p)
      continue
    }
    if (p.start < span.start) out.push({ ...p, end: span.start })
    const mid = { start: Math.max(p.start, span.start), end: Math.min(p.end, span.end) }
    out.push(WORST.indexOf(level) > WORST.indexOf(p.level) ? { ...mid, level, commitment } : { ...p, ...mid })
    if (span.end < p.end) out.push({ ...p, start: span.end })
  }
  return out
}

/** Counts by level of a stretch, everyone at their worst over it. */
export function tally(people: string[], weeks: Record<string, Week>, date: string, start: number, end: number): Omit<Slot, 'date' | 'start' | 'end'> {
  const out = { free: 0, maybe: 0, unknown: 0, busy: 0 }
  for (const id of people) out[worstBetween(weeks[id]?.[date] ?? [], start, end)]++
  return out
}

export interface BestQuery {
  dates: string[]
  people: string[]
  must: string[]
  weeks: Record<string, Week>
  step: number
  hours: Span
  length: number
  /** Taken stretches of the chosen rooms, per date (F5). */
  taken: Record<string, Span[]>
  roomOptional: boolean
  /** No slot starts before this date and minute. */
  after: { date: string, minute: number }
}

const overlaps = (spans: Span[], s: Span) => spans.some(t => t.start < s.end && s.start < t.end)

/** F3: slots of the length where every must-have person is free, ranked, at most ten. */
export function bestTimes(q: BestQuery): Slot[] {
  const found: Slot[] = []
  for (const date of q.dates) {
    for (let start = q.hours.start; start + q.length <= q.hours.end; start += q.step) {
      if (date < q.after.date || (date === q.after.date && start < q.after.minute)) continue
      const end = start + q.length
      if (!q.roomOptional && overlaps(q.taken[date] ?? [], { start, end })) continue
      if (q.must.some(id => worstBetween(q.weeks[id]?.[date] ?? [], start, end) !== 'free')) continue
      found.push({ date, start, end, ...tally(q.people, q.weeks, date, start, end) })
    }
  }
  return found
    .sort((a, b) => b.free - a.free || a.maybe - b.maybe || a.unknown - b.unknown || (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start))
    .slice(0, BEST_MAX)
}
