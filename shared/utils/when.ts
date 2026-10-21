// The two reader-facing date shapes (copy-style §9): short in a list, long in prose. Every one
// is Europe/London by construction (0014), and the separators are literal so no locale moves them.
import { committeeYearOf, formatLondon, isMonthDay, londonParts, startOfLondonDay } from './london'

// A number is epoch seconds, the wire convention throughout, or milliseconds above the line below.
// A bare YYYY-MM-DD is a London day, not the UTC midnight `new Date` would take it for.
export type When = number | string | Date

export interface WhenOptions {
  year?: boolean
  now?: Date
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

// The year 5138 in seconds and 1973 in milliseconds: nothing this system dates falls either side
// the wrong way, so a caller passing Date.now() reads as now rather than as 1970.
const MILLISECONDS_FROM = 100_000_000_000

export function whenInstant(value: When): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value >= MILLISECONDS_FROM ? value : value * 1000)
  return DAY.test(value) ? startOfLondonDay(value) : new Date(value)
}

// A year is noise inside the committee year the reader is living in and load-bearing outside it
// (0009). A caller that knows better says so either way.
function showsYear(at: Date, options: WhenOptions): boolean {
  if (options.year !== undefined) return options.year
  return committeeYearOf(at) !== committeeYearOf(options.now ?? new Date())
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

// Built from numbers, never from the locale's joined shape: browsers' ICU puts a comma after the
// weekday that the server's does not, and the difference broke hydration on every dated page.
function saysDate(at: Date, long: boolean, year: boolean): string {
  const { year: number, month, day } = londonParts(at)
  const weekday = WEEKDAYS[new Date(Date.UTC(number, month - 1, day)).getUTCDay()]!
  const named = `${long ? weekday : weekday.slice(0, 3)} ${day} ${(long ? MONTHS : SHORT_MONTHS)[month - 1]}`
  return year ? `${named} ${number}` : named
}

// The 24-hour clock, because the box office prints 19:30 on the ticket.
export function saysClock(value: When): string {
  return formatLondon(whenInstant(value), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

// A month's name alone, for a control that picks one. Not a date shape: no day and no year, and
// the day below is any day the month is sure to have.
export function saysMonth(month: number): string {
  return formatLondon(new Date(Date.UTC(2001, month - 1, 15)), { month: 'long' })
}

// A recurring MM-DD boundary as a person says it, "1 August"; anything else is returned untouched.
export function saysMonthDay(value: string): string {
  if (!isMonthDay(value)) return value
  const [month, day] = value.split('-').map(Number)
  return `${day} ${saysMonth(month!)}`
}

export function saysDay(value: When, options: WhenOptions = {}): string {
  const at = whenInstant(value)
  return saysDate(at, false, showsYear(at, options))
}

export function saysDayLong(value: When, options: WhenOptions = {}): string {
  const at = whenInstant(value)
  return saysDate(at, true, showsYear(at, options))
}

export function saysWhen(value: When, options: WhenOptions = {}): string {
  const at = whenInstant(value)
  return `${saysDate(at, false, showsYear(at, options))}, ${saysClock(value)}`
}

export function saysWhenLong(value: When, options: WhenOptions = {}): string {
  const at = whenInstant(value)
  return `${saysDate(at, true, showsYear(at, options))} at ${saysClock(value)}`
}

// A span of days names its year whenever an end leaves the calendar year the reader is in, once
// at the end when both share it and at both ends when they do not (0117).
export function saysDayRange(from: When, to: When, options: Pick<WhenOptions, 'now'> = {}): string {
  const first = whenInstant(from)
  const last = whenInstant(to)
  const thisYear = londonParts(options.now ?? new Date()).year
  const firstYear = londonParts(first).year
  const lastYear = londonParts(last).year
  const dated = firstYear !== thisYear || lastYear !== thisYear
  return `${saysDate(first, false, dated && firstYear !== lastYear)} to ${saysDate(last, false, dated)}`
}
