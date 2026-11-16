// The clock. Every reading of the time in server code goes through here, so a test sets it and no
// test reads the real time. Local dates and times are in the theatre's time zone (R7).
import { currentContext } from './context-store'

let fixed: number | undefined

/** Tests only: fix the clock at this instant (UTC milliseconds), or pass undefined to release it. */
export function setClock(ms: number | Date | string | undefined): void {
  fixed = ms === undefined ? undefined : new Date(ms).getTime()
}

/** Tests only: move a fixed clock forward. */
export function advanceClock(ms: number): void {
  if (fixed === undefined) throw new Error('advanceClock needs a fixed clock: call setClock first')
  fixed += ms
}

/** Now, in UTC milliseconds. */
export function nowMs(): number {
  return currentContext()?.clock?.() ?? fixed ?? Date.now()
}

/** Now, as a Date. */
export function now(): Date {
  return new Date(nowMs())
}

interface LocalParts { year: number, month: number, day: number, hour: number, minute: number, weekday: number }

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timeZone: string) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    formatters.set(timeZone, f)
  }
  return f
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The wall-clock reading of an instant in a time zone. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map(p => [p.type, p.value]))
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), weekday: WEEKDAYS.indexOf(parts.weekday!),
  }
}

/** YYYY-MM-DD for an instant in a time zone. */
export function localDateOf(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

const MINUTE = 60_000 // not-policy: unit of time

/** Instants whose wall-clock reading in the time zone is `wall` (a UTC-encoded wall time). */
function instantsShowing(wall: number, timeZone: string): number[] {
  const found: number[] = []
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) { // not-policy: the range of UTC offsets
    const instant = wall - offset * MINUTE
    const p = localParts(instant, timeZone)
    if (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === wall) found.push(instant)
  }
  return found
}

/**
 * The instant of a local wall-clock time on a local date. In the spring gap the time does not
 * exist, so the first minute after it that does is used; in the autumn overlap the earlier of the
 * two instants is used.
 */
export function instantOfLocal(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const wanted = Date.UTC(y, mo - 1, d, h, mi)
  for (let step = 0; step <= 180; step++) { // not-policy: no clock change skips more than three hours
    const found = instantsShowing(wanted + step * MINUTE, timeZone)
    if (found.length) return Math.min(...found)
  }
  throw new Error(`Cannot place ${date} ${time} in ${timeZone}`)
}

/** The date before a YYYY-MM-DD date. */
export function previousDate(date: string, days = 1): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}
