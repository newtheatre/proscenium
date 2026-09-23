import { describe, expect, test } from 'bun:test'
import { committeeYearOf, fromLondonWallClock } from '#shared/utils/london'
import { currentYear } from '#shared/utils/year'

// The year default (I-105 criterion 4, #934): a treasurer opening in September must see the
// running year, not the one that closed on 31 July (pinned here against committeeYearOf).

describe('the year boundary names a year by the 31 July it ends on (0009, 0087)', () => {
  test('31 July 23:59:59.999 London is still the year ending that July', () => {
    expect(committeeYearOf(fromLondonWallClock(2026, 7, 31, 23, 59, 59, 999))).toBe(2026)
  })

  test('1 August 00:00:00.000 London begins the next year', () => {
    expect(committeeYearOf(fromLondonWallClock(2026, 8, 1, 0, 0, 0, 0))).toBe(2027)
  })

  test('a September opening resolves to the running year, not the closed one (#934)', () => {
    expect(committeeYearOf(fromLondonWallClock(2026, 9, 11, 12, 0))).toBe(2027)
  })
})

describe('currentYear reads the clock once and agrees with committeeYearOf(now)', () => {
  test('it names whichever year contains this instant', () => {
    const before = committeeYearOf(new Date())
    const current = currentYear()
    const after = committeeYearOf(new Date())
    expect([before, after]).toContain(current)
  })
})
