import { londonParts, londonWeekday } from './london'

// Notice for a room we do not manage is working days, because a person reads the form and nobody
// reads it at a weekend (C-121, decision 0038).

const SATURDAY = 6
const SUNDAY = 0

// A London date, never a UTC one: late on a summer evening the two disagree, and the wrong one
// hands out a working day nobody worked (0014).
export function londonDate(at: Date): string {
  const parts = londonParts(at)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function isWorkingDay(at: Date, holidays: readonly string[]): boolean {
  const weekday = londonWeekday(at)
  if (weekday === SATURDAY || weekday === SUNDAY) return false
  return !holidays.includes(londonDate(at))
}

// Working days after `from`, up to and including `to`. A booking already past has no notice
// rather than negative notice: the caller refuses it for being in the past, not for its gap.
export function workingDaysBetween(from: Date, to: Date, holidays: readonly string[]): number {
  const target = londonDate(to)
  let counted = 0

  for (let at = nextDay(from); londonDate(at) <= target; at = nextDay(at)) {
    if (isWorkingDay(at, holidays)) counted++
  }

  return counted
}

// The date a form has to go in by, counted back from the booking. Negative steps backwards.
export function addWorkingDays(from: Date, days: number, holidays: readonly string[]): Date {
  const step = days < 0 ? -1 : 1
  let remaining = Math.abs(days)
  let at = from

  while (remaining > 0) {
    at = step < 0 ? previousDay(at) : nextDay(at)
    if (isWorkingDay(at, holidays)) remaining--
  }

  return at
}

// The furthest date the list reaches, whatever order it is in. Null means it reaches nothing.
export function lastCovered(holidays: readonly string[]): string | null {
  if (!holidays.length) return null
  return [...holidays].sort().at(-1) ?? null
}

// Whether the list can answer for a date at all. Read as "no holidays" it would count one as a
// working day and grant less notice than the rule requires, which is the failure it prevents.
export function coversThrough(holidays: readonly string[], through: Date): boolean {
  const reach = lastCovered(holidays)
  return reach !== null && reach >= londonDate(through)
}

// Noon, so a day's step never lands on a clock change and reads as the same day twice.
function nextDay(at: Date): Date {
  return shifted(at, 1)
}

function previousDay(at: Date): Date {
  return shifted(at, -1)
}

function shifted(at: Date, by: number): Date {
  const parts = londonParts(at)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + by, 12))
}
