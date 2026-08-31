import { z } from 'zod'

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

export const roomForm = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish().transform(value => (value ?? '').trim() || null),
  // Null is uncapped. Nought would be a room nobody may enter.
  capacity: z.number().int().positive().nullish().transform(value => value ?? null),
  isActive: z.boolean().default(true),
  // Books through the approval queue whatever the policy says (C-105 criterion 5).
  sensitive: z.boolean().default(false),
})

export type RoomInput = z.output<typeof roomForm>

export const roomHoursForm = z.object({
  weekday: z.number().int().min(0).max(6),
  opens: z.string().regex(TIME, 'A time reads as HH:MM'),
  closes: z.string().regex(TIME, 'A time reads as HH:MM'),
}).refine(hours => hours.closes > hours.opens, {
  path: ['closes'],
  message: 'A room closes after it opens',
})

export type RoomHours = z.output<typeof roomHoursForm>

export function closedOn(hours: RoomHours[], weekday: number): boolean {
  return !hours.some(day => day.weekday === weekday)
}

// Half-open at neither end: a booking must sit wholly inside the opening span.
export function isOpenAt(hours: RoomHours[], weekday: number, from: string, to: string): boolean {
  return hours.some(day => day.weekday === weekday && from >= day.opens && to <= day.closes)
}

export function minutesOpen(hours: RoomHours[], weekday: number): number {
  return hours
    .filter(day => day.weekday === weekday)
    .reduce((total, day) => total + (minutesInto(day.closes) - minutesInto(day.opens)), 0)
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
