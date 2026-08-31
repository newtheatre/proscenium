import { describe, expect, test } from 'bun:test'
import {
  WEEKDAYS,
  closedOn,
  isOpenAt,
  minutesOpen,
  overCapacity,
  roomForm,
  roomHoursForm,
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
