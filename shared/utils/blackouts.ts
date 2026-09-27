import { z } from 'zod'
import { overlaps } from './bookings'
import { formatLondon, fromLondonWallClock, startOfLondonDay, startOfLondonDayAfter } from './london'
import { plural } from './text'
import type { Span } from './bookings'

// A room shut for a reason everybody can read (C-114). The old app had no way to say a room was
// closed, so members booked into a get-in and found out on the night (RM-6).

export const BLACKOUT_REASON_LIMIT = 200

export interface Blackout extends Span {
  id: string
  roomId: string | null
  reason: string
}

// A blackout with no room is every room, which is what a building closure means.
export function coversRoom(blackout: { roomId: string | null }, roomId: string): boolean {
  return blackout.roomId === null || blackout.roomId === roomId
}

export function blackoutOver(blackouts: Blackout[], roomId: string, span: Span): Blackout | undefined {
  return blackouts.find(blackout => coversRoom(blackout, roomId) && overlaps(blackout, span))
}

// Why a write that wrote nothing wrote nothing, from what was read afterwards: a closure is named
// only when one is found, and anything else is the clash it has always been (issue 1347).
export function lostWriteCause(read: { roomLive: boolean, closed: boolean }): 'gone' | 'closed' | 'conflict' {
  if (!read.roomLive) return 'gone'
  return read.closed ? 'closed' : 'conflict'
}

// Shown rather than masked: a member turned away deserves to know it is a get-in and not a
// mystery, which is the one deliberate exception to conflict masking (criterion 4, C-103).
export function saysClosed(blackout: { reason: string }): string {
  return `The room is closed then: ${blackout.reason}`
}

const LONDON_DAY: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }

// Both ends carry a date when they fall on different London days, so a five-day get-in stops
// reading as nine hours (issue 1050).
export function saysSpan(startsAt: Date, endsAt: Date): string {
  const sameDay = formatLondon(startsAt, LONDON_DAY) === formatLondon(endsAt, LONDON_DAY)
  const from = formatLondon(startsAt, { dateStyle: 'medium', timeStyle: 'short' })
  const to = formatLondon(endsAt, sameDay ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' })
  return `${from} to ${to}`
}

// Closing cannot be undone (criterion 5), so the button says what it will cancel before it is
// pressed, and nothing is closed until a room, or every room, has been chosen (issue 1353).
export function closeButtonLabel(room: string | null, cancels: number | null): string {
  if (room === null) return 'Choose a room to close'
  if (cancels === null) return `Close ${room}`
  if (cancels === 0) return `Close ${room}: cancels nothing`
  return `Close ${room}: cancels ${plural(cancels, 'booking')}`
}

// A get-in over several days means the days, not nine to six on each of them.
export function wholeDaysByDefault(day: string, untilDay: string): boolean {
  return untilDay > day
}

export interface ClosureDraft { day: string, untilDay: string, from: string, to: string, wholeDays: boolean }

// London wall clocks, so the night the clocks change is a whole day of 23 or 25 hours (0014).
export function closureSpan(draft: ClosureDraft): { startsAt: string, endsAt: string } {
  const at = (day: string, clock: string): string => {
    const [year, month, date] = day.split('-').map(Number)
    const [hour, minute] = clock.split(':').map(Number)
    return fromLondonWallClock(year!, month!, date!, hour!, minute!).toISOString()
  }
  return draft.wholeDays
    ? { startsAt: startOfLondonDay(draft.day).toISOString(), endsAt: startOfLondonDayAfter(draft.untilDay, 1).toISOString() }
    : { startsAt: at(draft.day, draft.from), endsAt: at(draft.untilDay, draft.to) }
}

const instant = z.string().datetime()

export const blackoutForm = z.object({
  // Null is every room. An empty string would be a room id nobody has.
  roomId: z.string().min(1, 'Say which room you mean').max(64).nullish().transform(value => value ?? null),
  reason: z.string().trim().min(1, 'Say why the room is closed').max(BLACKOUT_REASON_LIMIT),
  startsAt: instant,
  endsAt: instant,
}).refine(blackout => new Date(blackout.endsAt) > new Date(blackout.startsAt), {
  path: ['endsAt'],
  message: 'A blackout ends after it starts',
})

export type BlackoutInput = z.output<typeof blackoutForm>

// What a closure would cancel, asked before it is made (issue 1353). Null is every room, as above.
export const strandedQuery = z.object({
  roomId: z.string().min(1, 'Say which room you mean').max(64).optional(),
  startsAt: instant,
  endsAt: instant,
}).refine(span => new Date(span.endsAt) > new Date(span.startsAt), {
  path: ['endsAt'],
  message: 'A blackout ends after it starts',
})
