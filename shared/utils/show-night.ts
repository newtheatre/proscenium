import { fromLondonWallClock, londonParts } from './london'
import { daysAfter, londonDay } from './membership'

// The show night runs 04:00 to 04:00 Europe/London, labelled by the London day it began as
// YYYY-MM-DD (0014, E-110). A constant, not configuration: nobody moves it under a live night.
export const SHOW_NIGHT_START_HOUR = 4

// Deliberately not the ledger's day. I-104 reconciles the SumUp Z by London calendar day
// (`ledger_entries.london_day`), so a 01:00 bar sale is tonight's takings but tomorrow's Z.

const LABEL = /^(\d{4})-(\d{2})-(\d{2})$/

// A real London date, not merely four digits and two pairs. Round-tripping through the calendar
// catches 2026-02-30 and, because Date.UTC reads a two-digit year as the 1900s, 0026-10-17 too.
function parseLabel(night: string): [number, number, number] {
  const match = LABEL.exec(night)
  if (!match || daysAfter(night, 0) !== night) {
    throw new TypeError(`a show night is labelled YYYY-MM-DD with a real date, not "${night}"`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function isShowNight(value: string): boolean {
  try {
    parseLabel(value)
    return true
  }
  catch {
    return false
  }
}

// The night an instant belongs to. Before 04:00 London the night is still the one that began
// on the previous London day, so a show ending at 01:00 belongs to the evening it started.
export function showNightOf(at: Date): string {
  const today = londonDay(at)
  return londonParts(at).hour >= SHOW_NIGHT_START_HOUR ? today : daysAfter(today, -1)
}

// `from` is inclusive and `to` exclusive. Both are 04:00 London on their own calendar day, so
// the night the clocks change is a real 23 or 25 hours and the till agrees with the wall clock.
export function showNightBounds(night: string): { from: Date, to: Date } {
  const [year, month, day] = parseLabel(night)
  const [nextYear, nextMonth, nextDay] = daysAfter(night, 1).split('-').map(Number) as [number, number, number]
  return {
    from: fromLondonWallClock(year, month, day, SHOW_NIGHT_START_HOUR),
    to: fromLondonWallClock(nextYear, nextMonth, nextDay, SHOW_NIGHT_START_HOUR),
  }
}

// Tonight, from the runtime clock. The runtime is UTC, and this is the only place a night is
// read off the clock rather than off a stored instant.
export function currentShowNight(): string {
  return showNightOf(new Date())
}
