import { fromLondonWallClock, londonWeekday } from './london'
import { daysAfter } from './membership'
import { showNightBounds, showNightOf, showNightOpensAt } from './show-night'

// The rota page's week chips and night grouping (issue 1335). A week is Monday's night to Sunday's, and
// a night runs 04:00 to 04:00, so a matinee and the evening share one and 00:30 is the night before (0014).

export const ROTA_WEEKS = ['ALL', 'THIS_WEEK', 'NEXT_WEEK', 'LATER'] as const
export type RotaWeek = (typeof ROTA_WEEKS)[number]

export function saysRotaWeek(week: RotaWeek): string {
  switch (week) {
    case 'ALL': return 'Coming up'
    case 'THIS_WEEK': return 'This week'
    case 'NEXT_WEEK': return 'Next week'
    case 'LATER': return 'Later'
    default: return week satisfies never
  }
}

export interface NightSpan { from?: string, to?: string }

// The show nights the open-shift list takes as `from` and `to`, inclusive, counted from the night
// in progress; absent is unbounded.
export function rotaWeekSpan(week: RotaWeek, tonight: string): NightSpan {
  const [year, month, date] = tonight.split('-').map(Number)
  const weekday = londonWeekday(fromLondonWallClock(year!, month!, date!, 12))
  const sunday = daysAfter(tonight, (7 - weekday) % 7)
  switch (week) {
    case 'ALL': return {}
    case 'THIS_WEEK': return { from: tonight, to: sunday }
    case 'NEXT_WEEK': return { from: daysAfter(sunday, 1), to: daysAfter(sunday, 7) }
    case 'LATER': return { from: daysAfter(sunday, 8) }
    default: return week satisfies never
  }
}

// Unix seconds, both inclusive as the list compares them: the last night is held whole to its 04:00.
export function rotaNightBounds(span: NightSpan): { from?: number, to?: number } {
  const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)
  return {
    from: span.from === undefined ? undefined : showNightOpensAt(span.from),
    to: span.to === undefined ? undefined : seconds(showNightBounds(span.to).to) - 1,
  }
}

// In the order given, which is soonest first from the list itself.
export function byNight<T extends { startsAt: number }>(items: readonly T[]): { night: string, items: T[] }[] {
  const nights = new Map<string, T[]>()
  for (const item of items) {
    const night = showNightOf(new Date(item.startsAt * 1000))
    nights.set(night, [...(nights.get(night) ?? []), item])
  }
  return [...nights.entries()].map(([night, grouped]) => ({ night, items: grouped }))
}
