import { describe, expect, test } from 'bun:test'
import {
  committeeYearEnd,
  committeeYearOf,
  formatLondon,
  fromLondonWallClock,
  londonParts,
  nextCommitteeYearEnd,
} from '#shared/utils/london'

// The named regression cases for time (K-121). The runtime is UTC, so every one of these is
// wrong for half the year if the zone is not pinned (0014).

const wall = (at: Date): string => formatLondon(at, { dateStyle: 'short', timeStyle: 'short' })

describe('the committee year ends at the last London instant of 31 July (0009)', () => {
  test('it is 22:59:59.999Z, because 31 July is British Summer Time', () => {
    expect(committeeYearEnd(2026).toISOString()).toBe('2026-07-31T22:59:59.999Z')
  })

  test('one millisecond later is the next committee year', () => {
    const end = committeeYearEnd(2026)
    expect(committeeYearOf(end)).toBe(2026)
    expect(committeeYearOf(new Date(end.getTime() + 1))).toBe(2027)
  })

  test('a grant made in the autumn expires the following 31 July', () => {
    const granted = fromLondonWallClock(2026, 9, 15, 19, 0)
    expect(nextCommitteeYearEnd(granted).toISOString()).toBe('2027-07-31T22:59:59.999Z')
  })

  test('a grant made in the spring expires that same 31 July', () => {
    const granted = fromLondonWallClock(2026, 3, 1, 12, 0)
    expect(nextCommitteeYearEnd(granted).toISOString()).toBe('2026-07-31T22:59:59.999Z')
  })
})

describe('a 19:00 weekly rehearsal stays 19:00 across both clock changes', () => {
  // 2026: clocks forward 29 March, back 25 October.
  test('through the spring change', () => {
    for (const day of [22, 29] as const) {
      expect(wall(fromLondonWallClock(2026, 3, day, 19, 0))).toContain('19:00')
    }
    // The instants are an hour apart in UTC, which is exactly the point.
    expect(fromLondonWallClock(2026, 3, 22, 19, 0).toISOString()).toBe('2026-03-22T19:00:00.000Z')
    expect(fromLondonWallClock(2026, 3, 29, 19, 0).toISOString()).toBe('2026-03-29T18:00:00.000Z')
  })

  test('through the autumn change', () => {
    for (const day of [18, 25] as const) {
      expect(wall(fromLondonWallClock(2026, 10, day, 19, 0))).toContain('19:00')
    }
    expect(fromLondonWallClock(2026, 10, 18, 19, 0).toISOString()).toBe('2026-10-18T18:00:00.000Z')
    expect(fromLondonWallClock(2026, 10, 25, 19, 0).toISOString()).toBe('2026-10-25T19:00:00.000Z')
  })
})

describe('a record expiring on a transition day expires on its date', () => {
  test('the last instant of the spring transition day is still that day', () => {
    const end = fromLondonWallClock(2026, 3, 29, 23, 59, 59, 999)
    expect(londonParts(end)).toMatchObject({ year: 2026, month: 3, day: 29 })
  })

  test('the autumn transition day has 25 hours and still ends on its own date', () => {
    const start = fromLondonWallClock(2026, 10, 25, 0, 0)
    const end = fromLondonWallClock(2026, 10, 25, 23, 59, 59, 999)
    expect(londonParts(end)).toMatchObject({ year: 2026, month: 10, day: 25 })
    expect((end.getTime() - start.getTime() + 1) / (60 * 60 * 1000)).toBe(25)
  })
})

describe('a date without an instant is refused rather than assumed', () => {
  test('an invalid date is refused', () => {
    expect(() => londonParts(new Date('not a date'))).toThrow(/valid Date/)
    expect(() => formatLondon(new Date(Number.NaN))).toThrow(/valid Date/)
  })

  test('formatting always pins the zone, whatever the runtime is set to', () => {
    const guyFawkes = new Date('2026-11-05T20:00:00.000Z')
    expect(formatLondon(guyFawkes, { timeStyle: 'short' })).toBe('20:00')
    // The same instant in July is an hour ahead of UTC in London.
    expect(formatLondon(new Date('2026-07-05T20:00:00.000Z'), { timeStyle: 'short' })).toBe('21:00')
  })
})
