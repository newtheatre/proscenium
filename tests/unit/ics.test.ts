import { describe, expect, test } from 'bun:test'
import { calendarFor, escapeText, fold, londonStamp, showsAs } from '#shared/utils/ics'
import { fromLondonWallClock } from '#shared/utils/london'

// C-104's pure half. Criterion 4 is the one that would break silently, so both transitions are
// automated cases rather than a note.

const HOST = 'newtheatre.org.uk'

function booking(over: Partial<Parameters<typeof calendarFor>[0][number]> = {}): Parameters<typeof calendarFor>[0][number] {
  return {
    id: 'abc',
    title: 'Read-through',
    room: 'The Studio',
    startsAt: Math.floor(fromLondonWallClock(2026, 1, 14, 19).getTime() / 1000),
    endsAt: Math.floor(fromLondonWallClock(2026, 1, 14, 21).getTime() / 1000),
    status: 'CONFIRMED',
    updatedAt: 1_700_000_000,
    ...over,
  }
}

describe('a wall clock survives both transitions (criterion 4)', () => {
  test('a 19:00 booking in January reads 19:00', () => {
    expect(londonStamp(fromLondonWallClock(2026, 1, 14, 19))).toBe('20260114T190000')
  })

  test('a 19:00 booking in July reads 19:00, not 18:00', () => {
    expect(londonStamp(fromLondonWallClock(2026, 7, 14, 19))).toBe('20260714T190000')
  })

  test('the evening the clocks go forward', () => {
    expect(londonStamp(fromLondonWallClock(2026, 3, 29, 19))).toBe('20260329T190000')
  })

  test('the evening the clocks go back', () => {
    expect(londonStamp(fromLondonWallClock(2026, 10, 25, 19))).toBe('20261025T190000')
  })

  test('every event names the zone rather than carrying an offset', () => {
    const calendar = calendarFor([booking()], { name: 'Mine', host: HOST })
    expect(calendar).toContain('DTSTART;TZID=Europe/London:20260114T190000')
    expect(calendar).toContain('DTEND;TZID=Europe/London:20260114T210000')
  })

  test('the rule a client resolves those times with travels with them', () => {
    const calendar = calendarFor([booking()], { name: 'Mine', host: HOST })
    expect(calendar).toContain('BEGIN:VTIMEZONE')
    expect(calendar).toContain('TZID:Europe/London')
    expect(calendar).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU')
    expect(calendar).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU')
  })
})

describe('a status reads as a calendar reads it (criterion 2 and 5)', () => {
  test('confirmed is confirmed and pending is tentative', () => {
    expect(showsAs('CONFIRMED')).toBe('CONFIRMED')
    expect(showsAs('PENDING_APPROVAL')).toBe('TENTATIVE')
  })

  test.each(['CANCELLED', 'REJECTED', 'BUMPED'])('%s is cancelled, so a client strikes it out', (status) => {
    expect(showsAs(status)).toBe('CANCELLED')
  })

  // A client keeps the copy it already fetched unless the new one outranks it.
  test('a cancelled event outranks the version already held', () => {
    const calendar = calendarFor([booking({ status: 'CANCELLED', updatedAt: 1_700_000_500 })], { name: 'Mine', host: HOST })
    expect(calendar).toContain('STATUS:CANCELLED')
    expect(calendar).toContain('SEQUENCE:1700000500')
  })

  // Not only cancellation: an approver moving a booking to a different room has to reach a client
  // that already holds the event, or it shows the old room until the subscription is remade.
  test('a booking moved to another room outranks it too', () => {
    const first = calendarFor([booking()], { name: 'Mine', host: HOST })
    const moved = calendarFor([booking({ room: 'The Rehearsal Room', updatedAt: 1_700_000_900 })], { name: 'Mine', host: HOST })

    const sequence = (calendar: string): number => Number(/SEQUENCE:(\d+)/.exec(calendar)![1])
    expect(sequence(moved)).toBeGreaterThan(sequence(first))
    expect(moved).toContain('LOCATION:The Rehearsal Room')
  })

  test('an unknown status is tentative rather than a broken calendar', () => {
    expect(showsAs('SOMETHING_NEW')).toBe('TENTATIVE')
  })
})

describe('the file is well formed', () => {
  test('it opens and closes, and every event does too', () => {
    const calendar = calendarFor([booking(), booking({ id: 'def' })], { name: 'Mine', host: HOST })
    expect(calendar.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(calendar.match(/END:VEVENT/g)).toHaveLength(2)
  })

  test('lines end CRLF, which is what a client parses', () => {
    expect(calendarFor([booking()], { name: 'Mine', host: HOST }).split('\n').every(line =>
      line === '' || line.endsWith('\r'))).toBe(true)
  })

  test('an empty calendar is still a calendar', () => {
    const calendar = calendarFor([], { name: 'Mine', host: HOST })
    expect(calendar).toContain('BEGIN:VCALENDAR')
    expect(calendar).not.toContain('BEGIN:VEVENT')
  })

  test('each booking keeps one identity, so refetching updates rather than duplicates', () => {
    expect(calendarFor([booking()], { name: 'Mine', host: HOST })).toContain(`UID:booking-abc@${HOST}`)
  })
})

describe('what a title may contain does not break the file', () => {
  test('a comma, a semicolon and a backslash are escaped', () => {
    expect(escapeText('Tech, dress; and \\ the get-out')).toBe('Tech\\, dress\\; and \\\\ the get-out')
  })

  test('a newline becomes its escape rather than a new property', () => {
    expect(escapeText('One\nTwo')).toBe('One\\nTwo')
  })

  test('a title with a comma stays on one property', () => {
    const calendar = calendarFor([booking({ title: 'Read-through, act one' })], { name: 'Mine', host: HOST })
    expect(calendar).toContain('SUMMARY:Read-through\\, act one')
  })
})

describe('long lines fold (RFC 5545)', () => {
  test('a short line is left alone', () => {
    expect(fold('SUMMARY:Short')).toBe('SUMMARY:Short')
  })

  test('a long one is split and continued with a space', () => {
    const folded = fold(`SUMMARY:${'a'.repeat(200)}`)
    expect(folded).toContain('\r\n ')
    expect(folded.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true)
  })

  test('unfolding a folded line gives back what went in', () => {
    const line = `SUMMARY:${'the quick brown fox '.repeat(12)}`
    expect(fold(line).replaceAll('\r\n ', '')).toBe(line)
  })

  // A fold inside a multi-byte character produces two invalid bytes rather than a character.
  test('a multi-byte character is never split', () => {
    const folded = fold(`SUMMARY:${'é'.repeat(100)}`)
    expect(folded.replaceAll('\r\n ', '')).toBe(`SUMMARY:${'é'.repeat(100)}`)
    expect(folded.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true)
  })
})
