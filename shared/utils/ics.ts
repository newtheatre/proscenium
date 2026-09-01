import { londonParts } from './london'

// iCalendar, hand-built (C-104). Every time is a London wall clock carrying a VTIMEZONE, never a
// UTC instant: a 19:00 rehearsal reads 19:00 in both halves of the year, in every client.

export const LONDON_TZID = 'Europe/London'

// The EU rule the UK still keeps: forward on the last Sunday of March, back on the last Sunday
// of October. Written out because a client resolves the times itself and needs the rule.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${LONDON_TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:BST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:GMT',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

// A booking's status as a calendar reads it. Anything settled is CANCELLED, so a client that
// already holds the event strikes it through rather than leaving it there (criterion 5).
const SHOWS_AS: Record<string, 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'> = {
  CONFIRMED: 'CONFIRMED',
  PENDING_APPROVAL: 'TENTATIVE',
  REJECTED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  BUMPED: 'CANCELLED',
}

export interface CalendarEvent {
  id: string
  title: string
  room: string
  startsAt: number
  endsAt: number
  status: string
  updatedAt: number
}

export function showsAs(status: string): string {
  return SHOWS_AS[status] ?? 'TENTATIVE'
}

// Local wall clock, which is what TZID means. A UTC stamp here would be an hour out all summer.
export function londonStamp(at: Date): string {
  const { year, month, day, hour, minute, second } = londonParts(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}`
}

function utcStamp(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

// Backslash, semicolon, comma and newline all mean something in a property value.
export function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n')
}

// RFC 5545 folds at 75 octets, and a multi-byte character may not be split across the fold.
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const parts: string[] = []
  let taken = 0
  for (const character of line) {
    const size = new TextEncoder().encode(character).length
    const limit = parts.length === 0 ? 75 : 74
    if (taken + size > limit) {
      parts.push('')
      taken = 0
    }
    if (parts.length === 0) parts.push('')
    parts[parts.length - 1] += character
    taken += size
  }

  return parts.map((part, at) => (at === 0 ? part : ` ${part}`)).join('\r\n')
}

function event(booking: CalendarEvent, host: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@${host}`,
    `DTSTAMP:${utcStamp(new Date(booking.updatedAt * 1000))}`,
    `DTSTART;TZID=${LONDON_TZID}:${londonStamp(new Date(booking.startsAt * 1000))}`,
    `DTEND;TZID=${LONDON_TZID}:${londonStamp(new Date(booking.endsAt * 1000))}`,
    `SUMMARY:${escapeText(booking.title)}`,
    `LOCATION:${escapeText(booking.room)}`,
    `STATUS:${showsAs(booking.status)}`,
    // Rises with every edit, so a moved room or a cancellation outranks the version a client
    // already holds. A cancelled-or-not flag left a reassigned booking showing the old room.
    `SEQUENCE:${Math.max(0, booking.updatedAt)}`,
    'END:VEVENT',
  ]
}

export function calendarFor(bookings: CalendarEvent[], options: { name: string, host: string }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Nottingham New Theatre//Rooms//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    `X-WR-TIMEZONE:${LONDON_TZID}`,
    ...VTIMEZONE,
    ...bookings.flatMap(booking => event(booking, options.host)),
    'END:VCALENDAR',
  ]

  return `${lines.map(fold).join('\r\n')}\r\n`
}
