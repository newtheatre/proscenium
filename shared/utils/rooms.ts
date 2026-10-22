import { z } from 'zod'
import { plural } from './text'

// The bookable estate. Opening hours belong to the room rather than to settings, so a room can be
// renamed or archived with them (0025, C-101); the absence of a row for a weekday means closed.

export const WEEKDAYS = [
  { index: 0, name: 'Sunday', short: 'Sun' },
  { index: 1, name: 'Monday', short: 'Mon' },
  { index: 2, name: 'Tuesday', short: 'Tue' },
  { index: 3, name: 'Wednesday', short: 'Wed' },
  { index: 4, name: 'Thursday', short: 'Thu' },
  { index: 5, name: 'Friday', short: 'Fri' },
  { index: 6, name: 'Saturday', short: 'Sat' },
] as const

// Zero-padded so they compare and sort as strings, which is why the whole file can avoid dates.
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

// Blank is no answer rather than an empty answer, the way a profile field is.
const text = (max: number) => z.string().trim().max(max).nullish()
  .transform(value => (value ?? '').trim() || null)

const override = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform(value => value ?? null)

export const roomForm = z.object({
  name: z.string().trim().min(1, 'Give the room a name people would recognise').max(120),
  description: text(2000),
  // Null is uncapped. Nought would be a room nobody may enter.
  capacity: z.number().int().positive().nullish().transform(value => value ?? null),
  isActive: z.boolean().default(true),
  // Books through the approval queue whatever the policy says (C-105 criterion 5).
  sensitive: z.boolean().default(false),
  campus: text(80),
  building: text(120),
  contact: text(500),
  // Blank falls back to the estate setting; nought is an override meaning none needed, so these
  // are nullish rather than optional-with-default (C-106 criterion 1).
  minBookingMinutes: override(z.number().int().positive()),
  maxBookingHours: override(z.number().positive()),
  noticeHours: override(z.number().int().nonnegative()),
  horizonWeeks: override(z.number().int().positive()),
  activeBookingsCap: override(z.number().int().positive()),
})

export type RoomInput = z.output<typeof roomForm>

// A query string, since a DELETE carries no body (0068). Absent is the old retire, which settles
// nothing; only "true" asks (0204).
const asked = z.enum(['true', 'false']).optional().transform(value => value === 'true')
export const retireQuery = z.object({ turnDown: asked, cancel: asked })

// The smallest number each override takes, declared once so a field, its hint and the write path
// cannot disagree (C-106 criterion 7). Only notice takes nought, meaning none needed.
export const ROOM_OVERRIDE_FLOORS = {
  minBookingMinutes: 1,
  maxBookingHours: 1,
  noticeHours: 0,
  horizonWeeks: 1,
  activeBookingsCap: 1,
} as const

export type RoomOverrideKey = keyof typeof ROOM_OVERRIDE_FLOORS

export function saysOverrideFloor(key: RoomOverrideKey): string {
  return ROOM_OVERRIDE_FLOORS[key] === 0 ? '0 means none needed' : 'One or more'
}

const OVERRIDE_UNITS: Record<RoomOverrideKey, string> = {
  minBookingMinutes: 'minute',
  maxBookingHours: 'hour',
  noticeHours: 'hour',
  horizonWeeks: 'week',
  activeBookingsCap: 'booking',
}

export const ROOM_OVERRIDE_KEYS = Object.keys(OVERRIDE_UNITS) as RoomOverrideKey[]

// What a blank box falls back to, with its unit, said under the box.
export function saysHouseDefault(key: RoomOverrideKey, value: number): string {
  return `House default: ${plural(value, OVERRIDE_UNITS[key])}. ${saysOverrideFloor(key)}.`
}

export function saysOverride(key: RoomOverrideKey, value: number): string {
  switch (key) {
    case 'minBookingMinutes': return `Shortest booking ${plural(value, 'minute')}`
    case 'maxBookingHours': return `Longest booking ${plural(value, 'hour')}`
    case 'noticeHours': return value === 0 ? 'No notice needed' : `${plural(value, 'hour')} notice`
    case 'horizonWeeks': return `Bookable ${plural(value, 'week')} ahead`
    case 'activeBookingsCap': return `${plural(value, 'booking')} per member`
    default: return key satisfies never
  }
}

// The rules a room sets for itself, in words, for the list's Own rules badge.
export function roomOverrides(room: Record<RoomOverrideKey, number | null>): string[] {
  return ROOM_OVERRIDE_KEYS.flatMap(key => (room[key] === null ? [] : [saysOverride(key, room[key])]))
}

export const roomHoursForm = z.object({
  weekday: z.number().int().min(0).max(6),
  opens: z.string().regex(TIME, 'A time reads as HH:MM'),
  closes: z.string().regex(TIME, 'A time reads as HH:MM'),
}).refine(hours => hours.closes > hours.opens, {
  path: ['closes'],
  message: 'Closing time must be later than opening time',
})

export type RoomHours = z.output<typeof roomHoursForm>

// Hours are chosen as a pattern before any one day: a room with none recorded is open whenever,
// and seven switches left off would read as seven closed days (issue 1353).
export const HOURS_MODES = ['ALWAYS', 'WEEKDAYS', 'EACH_DAY'] as const
export type HoursMode = (typeof HOURS_MODES)[number]

const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5]

export function saysHoursMode(mode: HoursMode): string {
  switch (mode) {
    case 'ALWAYS': return 'Always open'
    case 'WEEKDAYS': return 'Weekdays'
    case 'EACH_DAY': return 'Set each day'
    default: return mode satisfies never
  }
}

export function hoursModeOf(hours: RoomHours[]): HoursMode {
  if (hours.length === 0) return 'ALWAYS'
  const [first] = hours
  const weekdays = hours.length === MONDAY_TO_FRIDAY.length
    && MONDAY_TO_FRIDAY.every(weekday => hours.some(day => day.weekday === weekday))
    && hours.every(day => day.opens === first!.opens && day.closes === first!.closes)
  return weekdays ? 'WEEKDAYS' : 'EACH_DAY'
}

// Set each day starts from every day open at the times given, for the officer to close some.
export function hoursForMode(mode: HoursMode, opens: string, closes: string): RoomHours[] {
  if (mode === 'ALWAYS') return []
  const days = mode === 'WEEKDAYS' ? MONDAY_TO_FRIDAY : WEEKDAYS.map(day => day.index)
  return days.map(weekday => ({ weekday, opens, closes }))
}

export interface StripDay { day: string, weekday: string, date: number }

// The days a phone picks from with one tap (issue 1346). Calendar dates, not instants, so the
// night the clocks change is one day like any other (0014).
export function dateStrip(from: string, count = 14): StripDay[] {
  const [year, month, date] = from.split('-').map(Number)
  return Array.from({ length: count }, (_, offset) => {
    const at = new Date(Date.UTC(year!, month! - 1, date! + offset))
    return { day: at.toISOString().slice(0, 10), weekday: WEEKDAYS[at.getUTCDay()]!.short, date: at.getUTCDate() }
  })
}

// No hours at all is a room with no restriction worth recording, which is most of them. Hours
// once given are exhaustive: a weekday with no row is then a day the room is shut.
export function unrestricted(hours: RoomHours[]): boolean {
  return hours.length === 0
}

export function closedOn(hours: RoomHours[], weekday: number): boolean {
  if (unrestricted(hours)) return false
  return !hours.some(day => day.weekday === weekday)
}

// Half-open at neither end: a booking must sit wholly inside the opening span.
export function isOpenAt(hours: RoomHours[], weekday: number, from: string, to: string): boolean {
  if (unrestricted(hours)) return true
  return hours.some(day => day.weekday === weekday && from >= day.opens && to <= day.closes)
}

export function minutesOpen(hours: RoomHours[], weekday: number): number {
  return hours
    .filter(day => day.weekday === weekday)
    .reduce((total, day) => total + (minutesInto(day.closes) - minutesInto(day.opens)), 0)
}

// Monday first, the way the week is read here; Sunday's index stays 0 as Date has it.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

// "Mon to Fri, 09:00 to 22:00", or a run of days per set of times when the days differ.
export function saysOpeningHours(hours: RoomHours[]): string {
  if (unrestricted(hours)) return 'Always open'
  const timesOf = (weekday: number): string => hours
    .filter(day => day.weekday === weekday)
    .sort((one, other) => one.opens.localeCompare(other.opens))
    .map(day => `${day.opens} to ${day.closes}`)
    .join(' and ')

  const runs: { days: number[], times: string }[] = []
  let previous = ''
  for (const weekday of WEEK_ORDER) {
    const times = timesOf(weekday)
    if (times && times === previous) runs.at(-1)!.days.push(weekday)
    else if (times) runs.push({ days: [weekday], times })
    previous = times
  }

  const shortOf = (weekday: number): string => WEEKDAYS[weekday]!.short
  const daysOf = (days: number[]): string => {
    if (days.length === 7) return 'Every day'
    if (days.length === 1) return shortOf(days[0]!)
    if (days.length === 2) return `${shortOf(days[0]!)} and ${shortOf(days[1]!)}`
    return `${shortOf(days[0]!)} to ${shortOf(days.at(-1)!)}`
  }
  const sameTimes = new Set(runs.map(run => run.times)).size === 1
  if (sameTimes && runs.length > 1) {
    const listed = runs.map(run => daysOf(run.days)).join(', ')
    return `${listed}, ${runs[0]!.times}`
  }
  return runs.map(run => `${daysOf(run.days)}, ${run.times}`).join('; ')
}

function minutesInto(time: string): number {
  const [hour, minute] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

// A warning, never a refusal: the room still fits the booking somebody has already agreed to
// (C-101 criterion 5).
export function overCapacity(capacity: number | null, attendees: number | null): string | null {
  if (capacity === null || attendees === null || attendees <= capacity) return null
  return `That is more people than the room holds (${capacity}). It is allowed, but worth checking.`
}

export interface TapPick { start: number | null, span: { from: number, to: number } | null }

// Picking a span by tapping its ends, because a touch pointer sends no enter events between press
// and release and so cannot drag across the grid (C-102 criterion 6). Minutes into the day.
export function tapToSpan(start: number | null, tapped: number, slotMinutes: number): TapPick {
  if (start === null || tapped < start) return { start: tapped, span: null }
  return { start: null, span: { from: start, to: tapped + slotMinutes } }
}
