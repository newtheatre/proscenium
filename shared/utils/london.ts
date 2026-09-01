// Every domain date is Europe/London, and the show night runs 04:00 to 04:00 (0014). The
// runtime is UTC, so an unpinned date is wrong for half the year.
export const LONDON = 'Europe/London'

// The committee year, the season and role expiry all end on 31 July (0009).
export const COMMITTEE_YEAR_END_MONTH = 7
export const COMMITTEE_YEAR_END_DAY = 31

// The night belongs to the day it started on until 04:00, so a 01:00 bar sale is still
// last night's takings.
export const SHOW_NIGHT_START_HOUR = 4

export interface LondonParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

// A Date is an instant, never a wall clock, so anything else is refused rather than coerced
// into whatever the runtime's zone happens to be.
function assertInstant(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('a London date helper takes a valid Date; a wall-clock string has no instant until its zone is known')
  }
}

export function londonParts(at: Date): LondonParts {
  assertInstant(at)
  const found: Record<string, number> = {}
  for (const part of PARTS.formatToParts(at)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  return {
    year: found.year!,
    month: found.month!,
    day: found.day!,
    hour: found.hour!,
    minute: found.minute!,
    second: found.second!,
  }
}

function asIfUTC(parts: LondonParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

function offsetMs(at: Date): number {
  // Compare whole seconds: the parts carry no milliseconds, so an instant that has some would
  // otherwise skew the offset by up to 999ms. Zone offsets are whole minutes regardless.
  const whole = Math.floor(at.getTime() / 1000) * 1000
  return asIfUTC(londonParts(new Date(whole))) - whole
}

// London wall clock to the instant it names. Two passes, because the offset at the guess can
// differ from the offset at the answer on the two days a year the clocks move.
export function fromLondonWallClock(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  const once = wall - offsetMs(new Date(wall))
  return new Date(wall - offsetMs(new Date(once)))
}

// A recurring London day of the year, written MM-DD. Judged against a common year, because a
// boundary that only exists in a leap year would read as NaN in three years out of four.
export function isMonthDay(value: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= new Date(Date.UTC(2001, month, 0)).getUTCDate()
}

// The last instant of 31 July, London: when roles lapse and the committee year turns (0009).
export function committeeYearEnd(year: number): Date {
  return fromLondonWallClock(year, COMMITTEE_YEAR_END_MONTH, COMMITTEE_YEAR_END_DAY, 23, 59, 59, 999)
}

// The committee year an instant falls in, named by the year it ends in.
export function committeeYearOf(at: Date): number {
  const { year } = londonParts(at)
  return at.getTime() <= committeeYearEnd(year).getTime() ? year : year + 1
}

// What a grant made now expires at, unless it is permanent (0009).
export function nextCommitteeYearEnd(at: Date): Date {
  return committeeYearEnd(committeeYearOf(at))
}

// The show night an instant belongs to, as a London calendar date.
export function showNightOf(at: Date): { year: number, month: number, day: number } {
  const parts = londonParts(at)
  if (parts.hour >= SHOW_NIGHT_START_HOUR) return { year: parts.year, month: parts.month, day: parts.day }
  const previous = londonParts(new Date(at.getTime() - 24 * 60 * 60 * 1000))
  return { year: previous.year, month: previous.month, day: previous.day }
}

// The 04:00 to 04:00 window a night runs over.
export function showNightBounds(at: Date): { from: Date, to: Date } {
  const night = showNightOf(at)
  const from = fromLondonWallClock(night.year, night.month, night.day, SHOW_NIGHT_START_HOUR)
  const next = new Date(from.getTime() + 26 * 60 * 60 * 1000)
  const after = londonParts(next)
  return { from, to: fromLondonWallClock(after.year, after.month, after.day, SHOW_NIGHT_START_HOUR) }
}

// londonParts carries no weekday, and the opening-hours rule needs one. Derived from the London
// wall clock rather than the instant, so an evening in BST is the evening it looks like (0014).
export function londonWeekday(at: Date): number {
  const { year, month, day } = londonParts(at)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// The wall clock a room's opening hours are written in, zero-padded so it compares as a string.
export function londonClock(at: Date): string {
  const { hour, minute } = londonParts(at)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatLondon(at: Date, options: Intl.DateTimeFormatOptions = {}): string {
  assertInstant(at)
  return new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, ...options }).format(at)
}
