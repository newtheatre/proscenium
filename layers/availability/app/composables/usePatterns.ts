// Weekly patterns (S2): the person's patterns with their lines, and a typical week of a pattern as
// the grid draws it, Monday to Sunday with unmarked time between the lines.
import { addDays, DAY_MINUTES, spanOf, type Day, type Line, type Piece } from '../../shared/grid'

export interface PatternRow { id: string, label: string, startsOn: string, endsOn: string | null, lines: Line[] }
export interface Patterns { today: string, horizon: string, grid: { step: number, dayStarts: string }, patterns: PatternRow[] }

/** Any Monday stands for "a Monday" in a pattern's week; 1 January 2001 was one. */
export const TYPICAL_MONDAY = '2001-01-01' // not-policy: a date that is a Monday
export const typicalDates = Array.from({ length: 7 }, (_, i) => addDays(TYPICAL_MONDAY, i)) // not-policy: a week

/** The pattern's week as grid days: each weekday's lines, unmarked between. */
export function typicalWeek(lines: Line[]): Day[] {
  return typicalDates.map((date, i) => {
    const pieces: Piece[] = []
    let at = 0
    for (const l of lines.filter(x => x.weekday === i + 1).sort((a, b) => a.from.localeCompare(b.from))) {
      const { start, end } = spanOf(l.from, l.until)
      if (start > at) pieces.push({ start: at, end: start, level: 'unknown' })
      pieces.push({ start, end, level: l.level })
      at = end
    }
    if (at < DAY_MINUTES) pieces.push({ start: at, end: DAY_MINUTES, level: 'unknown' })
    return { date, pieces }
  })
}

export function usePatterns() {
  return useAPI<Patterns>('/api/availability/patterns', { key: 'availability:patterns' })
}
