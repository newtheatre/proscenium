import { describe, expect, test } from 'bun:test'
import { saysSpan } from '#shared/utils/blackouts'
import {
  WEEKDAYS,
  closedOn,
  isOpenAt,
  minutesOpen,
  overCapacity,
  retireQuery,
  roomForm,
  roomHoursForm,
  roomOverrides,
  saysHouseDefault,
  saysOpeningHours,
} from '#shared/utils/rooms'

// C-101. The bookable estate reflects reality: a room carries its own opening hours, is
// deactivated rather than deleted, and its capacity warns rather than refuses.

const HOURS = [{ weekday: 1, opens: '09:00', closes: '22:00' }]

describe('a room is described before it is booked', () => {
  test('a name is required and a capacity is not', () => {
    expect(roomForm.safeParse({ name: 'The Studio' }).success).toBe(true)
    expect(roomForm.safeParse({ name: '' }).success).toBe(false)
    expect(roomForm.safeParse({ name: '   ' }).success).toBe(false)
  })

  test('an uncapped room says so with no number rather than a nought', () => {
    expect(roomForm.parse({ name: 'The Studio' }).capacity).toBeNull()
    expect(roomForm.safeParse({ name: 'The Studio', capacity: 0 }).success).toBe(false)
    expect(roomForm.parse({ name: 'The Studio', capacity: 40 }).capacity).toBe(40)
  })

  test('a room is active and unsensitive until somebody says otherwise', () => {
    const room = roomForm.parse({ name: 'The Studio' })
    expect(room.isActive).toBe(true)
    expect(room.sensitive).toBe(false)
  })
})

// Criterion 1: per-weekday opening hours, and the absence of a row is a closed day.
describe('opening hours belong to the room', () => {
  test('there are seven weekdays and Monday is one', () => {
    expect(WEEKDAYS).toHaveLength(7)
    expect(WEEKDAYS.map(day => day.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test('a room with hours is closed on a day it has no row for', () => {
    expect(closedOn(HOURS, 2)).toBe(true)
    expect(closedOn(HOURS, 1)).toBe(false)
  })

  // A room nobody has given hours to is open, not shut. Most rooms have no restriction worth
  // recording, and making the officer fill in seven days to say so is the wrong default.
  test('a room with no hours at all is always open', () => {
    expect(closedOn([], 2)).toBe(false)
    expect(isOpenAt([], 3, '03:00', '05:00')).toBe(true)
  })

  test('but a room that has said when it opens is shut outside those hours', () => {
    expect(isOpenAt(HOURS, 1, '03:00', '05:00')).toBe(false)
  })

  test('a span inside the day is open and one crossing the close is not', () => {
    expect(isOpenAt(HOURS, 1, '10:00', '12:00')).toBe(true)
    expect(isOpenAt(HOURS, 1, '09:00', '22:00')).toBe(true)
    expect(isOpenAt(HOURS, 1, '08:00', '10:00')).toBe(false)
    expect(isOpenAt(HOURS, 1, '21:00', '23:00')).toBe(false)
  })

  test('a closed day is closed whatever the hour', () => {
    expect(isOpenAt(HOURS, 2, '10:00', '12:00')).toBe(false)
  })

  test('hours that close before they open are refused', () => {
    expect(roomHoursForm.safeParse({ weekday: 1, opens: '22:00', closes: '09:00' }).success).toBe(false)
    expect(roomHoursForm.safeParse({ weekday: 1, opens: '09:00', closes: '09:00' }).success).toBe(false)
    expect(roomHoursForm.safeParse({ weekday: 1, opens: '09:00', closes: '22:00' }).success).toBe(true)
  })

  test('a weekday outside the week is refused, and a time that is not one', () => {
    expect(roomHoursForm.safeParse({ weekday: 7, opens: '09:00', closes: '22:00' }).success).toBe(false)
    expect(roomHoursForm.safeParse({ weekday: 1, opens: '9am', closes: '22:00' }).success).toBe(false)
    expect(roomHoursForm.safeParse({ weekday: 1, opens: '25:00', closes: '26:00' }).success).toBe(false)
  })

  test('how long a day is open, for a screen that wants to say so', () => {
    expect(minutesOpen(HOURS, 1)).toBe(13 * 60)
    expect(minutesOpen(HOURS, 2)).toBe(0)
  })
})

// Criterion 5: the old estate recorded both and compared neither. This warns; it never refuses.
describe('capacity warns and does not refuse', () => {
  test('more attendees than the room holds is worth saying', () => {
    expect(overCapacity(20, 30)).toBeTruthy()
    expect(overCapacity(20, 30)).toContain('20')
  })

  test('a room within capacity says nothing', () => {
    expect(overCapacity(20, 20)).toBeNull()
    expect(overCapacity(20, 5)).toBeNull()
  })

  test('an uncapped room cannot be over capacity', () => {
    expect(overCapacity(null, 500)).toBeNull()
  })

  test('a booking that names no attendee count is not a breach', () => {
    expect(overCapacity(20, null)).toBeNull()
  })
})

// C-114 criterion 1: a closure is a span, and a span over days has to read as one (issue 1050).
describe('a closure reads back as the span it is', () => {
  const at = (iso: string): Date => new Date(iso)

  test('one afternoon names its day once', () => {
    const said = saysSpan(at('2026-09-15T08:00:00Z'), at('2026-09-15T17:00:00Z'))
    expect(said.match(/2026/g)).toHaveLength(1)
    expect(said).toContain('09:00 to 18:00')
  })

  test('a five-day get-in names the day it ends on too', () => {
    const said = saysSpan(at('2026-09-15T08:00:00Z'), at('2026-09-19T17:00:00Z'))
    expect(said).toContain('15 Sept 2026, 09:00')
    expect(said).toContain('19 Sept 2026, 18:00')
  })

  // The London day is what changes here, not a whole calendar date typed by anybody (0014).
  test('a closure running past London midnight names both days', () => {
    const said = saysSpan(at('2026-09-15T21:00:00Z'), at('2026-09-15T23:30:00Z'))
    expect(said).toContain('15 Sept 2026, 22:00')
    expect(said).toContain('16 Sept 2026, 00:30')
  })
})

// The rooms review, section 1: the list says when a room is open and which rules are its own.
describe('a room reads back as its hours and its own rules', () => {
  const weekdays = [1, 2, 3, 4, 5].map(weekday => ({ weekday, opens: '09:00', closes: '22:00' }))

  test('no hours is always open, and one set of times for a run of days is said once', () => {
    expect(saysOpeningHours([])).toBe('Always open')
    expect(saysOpeningHours(weekdays)).toBe('Mon to Fri, 09:00 to 22:00')
    expect(saysOpeningHours([0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '10:00', closes: '18:00' }))))
      .toBe('Every day, 10:00 to 18:00')
  })

  test('days apart with the same times are listed, then the times', () => {
    expect(saysOpeningHours([1, 3, 5].map(weekday => ({ weekday, opens: '09:00', closes: '17:00' }))))
      .toBe('Mon, Wed, Fri, 09:00 to 17:00')
  })

  test('days whose times differ are said a run at a time', () => {
    expect(saysOpeningHours([...weekdays.slice(0, 4), { weekday: 5, opens: '09:00', closes: '18:00' }]))
      .toBe('Mon to Thu, 09:00 to 22:00; Fri, 09:00 to 18:00')
  })

  test('two spans in one day are both said', () => {
    expect(saysOpeningHours([{ weekday: 6, opens: '14:00', closes: '18:00' }, { weekday: 6, opens: '09:00', closes: '12:00' }]))
      .toBe('Sat, 09:00 to 12:00 and 14:00 to 18:00')
  })

  test('the house default is said with its unit and what the box accepts', () => {
    expect(saysHouseDefault('minBookingMinutes', 30)).toBe('House default: 30 minutes. One or more.')
    expect(saysHouseDefault('noticeHours', 48)).toBe('House default: 48 hours. 0 means none needed.')
    expect(saysHouseDefault('horizonWeeks', 1)).toBe('House default: 1 week. One or more.')
  })

  test('a room following the house has no own rules, and one with them lists each', () => {
    const none = { minBookingMinutes: null, maxBookingHours: null, noticeHours: null, horizonWeeks: null, activeBookingsCap: null }
    expect(roomOverrides(none)).toEqual([])
    expect(roomOverrides({ ...none, maxBookingHours: 2, noticeHours: 0 })).toEqual(['Longest booking 2 hours', 'No notice needed'])
  })

  test('backwards hours are refused in words that say what to change', () => {
    const parsed = roomHoursForm.safeParse({ weekday: 1, opens: '22:00', closes: '09:00' })
    expect(parsed.error?.issues[0]?.message).toBe('Closing time must be later than opening time')
  })
})

describe('retiring settles nothing unless asked (0204)', () => {
  test('nothing asked is the old retire', () => {
    expect(retireQuery.parse({})).toEqual({ turnDown: false, cancel: false })
    expect(retireQuery.parse({ turnDown: 'false', cancel: 'false' })).toEqual({ turnDown: false, cancel: false })
  })

  test('each half is asked for apart, and only by "true"', () => {
    expect(retireQuery.parse({ turnDown: 'true' })).toEqual({ turnDown: true, cancel: false })
    expect(retireQuery.safeParse({ cancel: 'yes' }).success).toBe(false)
  })
})
