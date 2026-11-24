// Writing a calendar file (RFC 5545): the escaping, line folding and times every .ics this site
// serves shares, the private feed (C-70) and Front of house's single-shift file alike.
import { localDate, nowMs } from '#kit'

export interface IcsEvent {
  uid: string
  startsAt: number
  endsAt: number
  allDay?: boolean
  title: string
  location?: string
  description?: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  transparent?: boolean
  updatedAt?: number
}

/** The text of a calendar property: commas, semicolons, backslashes and line breaks escaped. */
export const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** A content line folded at 75 bytes, each continuation starting with one space. */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line // not-policy: the calendar format's line length
  const out: string[] = []
  let current = ''
  for (const char of line) {
    if (encoder.encode(current + char).length > (out.length ? 74 : 75)) { // not-policy: the calendar format's line length, less the leading space
      out.push(current)
      current = ''
    }
    current += char
  }
  out.push(current)
  return out.join('\r\n ')
}

export const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // not-policy: drops the milliseconds

const day = async (ms: number) => (await localDate(ms)).replace(/-/g, '')

async function times(event: IcsEvent): Promise<string[]> {
  if (!event.allDay) return [`DTSTART:${stamp(event.startsAt)}`, `DTEND:${stamp(event.endsAt)}`]
  // An all-day event ends on the day after its last, in the theatre's own dates.
  const last = await day(Math.max(event.startsAt, event.endsAt - 1))
  const end = new Date(Date.UTC(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6) + 1)).toISOString().slice(0, 10).replace(/-/g, '') // not-policy: the parts of YYYYMMDD
  return [`DTSTART;VALUE=DATE:${await day(event.startsAt)}`, `DTEND;VALUE=DATE:${end}`]
}

async function lines(event: IcsEvent, now: number): Promise<string[]> {
  const changed = event.updatedAt ?? now
  return [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(changed)}`,
    ...(event.updatedAt !== undefined ? [`LAST-MODIFIED:${stamp(event.updatedAt)}`, `SEQUENCE:${Math.floor(event.updatedAt / 60_000)}`] : []), // not-policy: minutes, so a later change always sorts higher
    ...await times(event),
    `SUMMARY:${escape(event.title)}`,
    ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
    `STATUS:${event.status.toUpperCase()}`,
    ...(event.transparent ? ['TRANSP:TRANSPARENT'] : []),
    'END:VEVENT',
  ]
}

/** A whole calendar file: the events in the order given, CRLF line ends, lines folded. */
export async function icsFile(name: string, events: readonly IcsEvent[], now = nowMs()): Promise<string> {
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Proscenium//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
  ]
  for (const event of events) body.push(...await lines(event, now))
  body.push('END:VCALENDAR')
  return `${body.map(fold).join('\r\n')}\r\n`
}
