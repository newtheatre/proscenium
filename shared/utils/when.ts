// The two reader-facing date shapes (copy-style §9): short in a list, long in prose. Every one
// is Europe/London by construction (0014), and the separators are literal so no locale moves them.
import { committeeYearOf, formatLondon, isMonthDay, startOfLondonDay } from './london'

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

function saysDate(at: Date, long: boolean, year: boolean): string {
  const named = formatLondon(at, {
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : 'short',
  })
  return year ? `${named} ${formatLondon(at, { year: 'numeric' })}` : named
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
