import { describe, expect, test } from 'bun:test'
import { saysStanding, refusalToRecord, standingFor, windowStart } from '#shared/utils/no-shows'
import { committeeYearEnd } from '#shared/utils/london'

// C-116's pure half. The ladder is configuration, so nothing here knows the numbers (0012).

const LADDER = { recordAt: 2, preApprovalAt: 3 }

describe('the ladder is the configured numbers', () => {
  test('nothing, or one, is clear', () => {
    expect(standingFor(0, LADDER)).toBe('CLEAR')
    expect(standingFor(1, LADDER)).toBe('CLEAR')
  })

  test('the second is recorded', () => {
    expect(standingFor(2, LADDER)).toBe('RECORDED')
  })

  test('the third needs pre-approval, and so does the tenth', () => {
    expect(standingFor(3, LADDER)).toBe('PRE_APPROVAL')
    expect(standingFor(10, LADDER)).toBe('PRE_APPROVAL')
  })

  test('a committee that changes the numbers changes the ladder', () => {
    expect(standingFor(3, { recordAt: 5, preApprovalAt: 8 })).toBe('CLEAR')
    expect(standingFor(1, { recordAt: 1, preApprovalAt: 2 })).toBe('RECORDED')
  })

  test('what a member is told names the next step, not just the count', () => {
    expect(saysStanding('RECORDED', 2, LADDER)).toContain('3')
    expect(saysStanding('PRE_APPROVAL', 3, LADDER)).toContain('checked by a person')
    expect(saysStanding('CLEAR', 0, LADDER)).toBe('Nothing on your record.')
  })
})

// Rolling, and never further back than the committee year, whichever is shorter (0009).
describe('the window the ladder counts over', () => {
  test('mid-year, the rolling window is what bounds it', () => {
    const now = new Date('2027-06-15T12:00:00Z')
    const start = windowStart(now, 30)
    expect(start).toBe(Math.floor(now.getTime() / 1000) - 30 * 86_400)
  })

  test('a long window is cut off at the committee year start', () => {
    const now = new Date('2026-09-15T12:00:00Z')
    const start = windowStart(now, 365)
    // The 2027 committee year began the instant after 31 July 2026 ended.
    expect(start).toBe(Math.floor(committeeYearEnd(2026).getTime() / 1000) + 1)
  })

  test('a no-show from before the handover does not follow somebody into the new year', () => {
    const justAfter = new Date('2026-08-02T12:00:00Z')
    expect(windowStart(justAfter, 365)).toBeGreaterThan(Math.floor(new Date('2026-07-31T00:00:00Z').getTime() / 1000))
  })

  test('and a June one is not wiped by the July handover while the year still runs', () => {
    const june = new Date('2026-06-20T12:00:00Z')
    const start = windowStart(june, 365)
    expect(start).toBeLessThan(Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000))
  })
})

describe('what may be marked (criterion 1)', () => {
  const NOW = 1_800_000_000

  test('a confirmed booking that has happened', () => {
    expect(refusalToRecord({ status: 'CONFIRMED', endsAt: NOW - 3600 }, NOW)).toBeNull()
  })

  test('not one still to come', () => {
    expect(refusalToRecord({ status: 'CONFIRMED', endsAt: NOW + 3600 }, NOW))
      .toBe('That booking has not happened yet')
  })

  test.each(['CANCELLED', 'REJECTED', 'PENDING_APPROVAL', 'BUMPED'])('not a %s one', (status) => {
    expect(refusalToRecord({ status, endsAt: NOW - 3600 }, NOW))
      .toBe('Only a confirmed booking can be marked as a no-show')
  })
})
