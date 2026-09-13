import { describe, expect, test } from 'bun:test'
import { committeeYearOf, fromLondonWallClock } from '#shared/utils/london'
import { currentSeasonYear } from '#shared/utils/season'

// The season-year default (I-105 criterion 4, #934): a treasurer opening in September must see
// the running season, not the one that closed on 31 July (pinned here against committeeYearOf).

describe('the season boundary names a year by the season it ends in (0009)', () => {
  test('31 July 23:59:59.999 London is still the season ending that year', () => {
    expect(committeeYearOf(fromLondonWallClock(2026, 7, 31, 23, 59, 59, 999))).toBe(2026)
  })

  test('1 August 00:00:00.000 London begins the next season', () => {
    expect(committeeYearOf(fromLondonWallClock(2026, 8, 1, 0, 0, 0, 0))).toBe(2027)
  })

  test('a September opening resolves to the running season, not the closed one (#934)', () => {
    expect(committeeYearOf(fromLondonWallClock(2026, 9, 11, 12, 0))).toBe(2027)
  })
})

describe('currentSeasonYear reads the clock once and agrees with committeeYearOf(now)', () => {
  test('it names whichever season contains this instant', () => {
    const before = committeeYearOf(new Date())
    const current = currentSeasonYear()
    const after = committeeYearOf(new Date())
    expect([before, after]).toContain(current)
  })
})
