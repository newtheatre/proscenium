import { describe, expect, test } from 'bun:test'
import { showNightOf } from '#shared/utils/show-night'
import { saysClock, saysDay, saysDayLong, saysWhen, saysWhenLong } from '#shared/utils/when'

// A fixed "today" so the year rule is judged against a known committee year rather than the
// clock the suite happens to run on (0009).
const NOW = new Date('2026-09-21T10:00:00Z')
const seconds = (iso: string): number => Date.parse(iso) / 1000

describe('the two date shapes (K-128 criterion 1, copy-style §9)', () => {
  test('short is "Wed 14 Oct, 19:30"', () => {
    expect(saysWhen(seconds('2026-10-14T18:30:00Z'), { now: NOW })).toBe('Wed 14 Oct, 19:30')
  })

  test('long is "Wednesday 14 October at 19:30"', () => {
    expect(saysWhenLong(seconds('2026-10-14T18:30:00Z'), { now: NOW })).toBe('Wednesday 14 October at 19:30')
  })

  test('the date-only pair drops the clock and keeps the shapes', () => {
    expect(saysDay('2026-10-14', { now: NOW })).toBe('Wed 14 Oct')
    expect(saysDayLong('2026-10-14', { now: NOW })).toBe('Wednesday 14 October')
  })

  test('a day string reads as that London day, not the UTC midnight before it', () => {
    expect(saysDay('2026-01-01', { year: true })).toBe('Thu 1 Jan 2026')
  })
})

describe('every shape is Europe/London (0014)', () => {
  test('the same wall clock reads the same either side of the BST boundary', () => {
    expect(saysWhen(seconds('2027-06-14T18:30:00Z'), { now: NOW })).toBe('Mon 14 Jun, 19:30')
    expect(saysWhen(seconds('2026-12-14T19:30:00Z'), { now: NOW })).toBe('Mon 14 Dec, 19:30')
  })

  test('an hour before the clocks go back is still BST', () => {
    expect(saysClock(seconds('2026-10-25T00:30:00Z'))).toBe('01:30')
    expect(saysClock(seconds('2026-10-25T01:30:00Z'))).toBe('01:30')
  })
})

describe('the year shows only when it is not the committee year in hand (0009)', () => {
  test('a date inside this committee year carries no year', () => {
    expect(saysWhen(seconds('2026-10-14T18:30:00Z'), { now: NOW })).not.toContain('2026')
  })

  test('a date in the committee year before carries its year', () => {
    expect(saysWhen(seconds('2025-10-14T18:30:00Z'), { now: NOW })).toBe('Tue 14 Oct 2025, 19:30')
    expect(saysWhenLong(seconds('2025-10-14T18:30:00Z'), { now: NOW }))
      .toBe('Tuesday 14 October 2025 at 19:30')
  })

  test('a caller may ask for the year or refuse it', () => {
    expect(saysDay('2026-10-14', { now: NOW, year: true })).toBe('Wed 14 Oct 2026')
    expect(saysDay('2025-10-14', { now: NOW, year: false })).toBe('Tue 14 Oct')
  })

  test('31 July is the turn: the day after starts a new committee year', () => {
    expect(saysDay('2026-07-31', { now: NOW })).toBe('Fri 31 Jul 2026')
    expect(saysDay('2026-08-01', { now: NOW })).toBe('Sat 1 Aug')
  })
})

describe('an ISO string and an epoch say the same words', () => {
  test('the two spellings of one instant agree', () => {
    const iso = '2026-10-14T18:30:00.000Z'
    expect(saysWhen(iso, { now: NOW })).toBe(saysWhen(seconds(iso), { now: NOW }))
    expect(saysWhenLong(iso, { now: NOW })).toBe(saysWhenLong(seconds(iso), { now: NOW }))
  })

  test('a number in milliseconds says the same words as the same instant in seconds', () => {
    const at = seconds('2026-10-14T18:30:00Z')
    expect(saysWhen(at * 1000, { now: NOW })).toBe(saysWhen(at, { now: NOW }))
  })

  test('a Date says the same words as the epoch it holds', () => {
    const at = seconds('2026-10-14T18:30:00Z')
    expect(saysWhen(new Date(at * 1000), { now: NOW })).toBe(saysWhen(at, { now: NOW }))
  })
})

describe('the line between seconds and milliseconds (1e11)', () => {
  test('just under the line is seconds', () => {
    expect(saysDay(99_999_999_999, { year: true })).toBe('Wed 16 Nov 5138')
  })

  test('on the line is milliseconds', () => {
    expect(saysDay(100_000_000_000, { year: true })).toBe('Sat 3 Mar 1973')
  })
})

describe('midnight and the show-night boundary read as the right day (0014)', () => {
  test('half past midnight London is the new calendar day, not the old one', () => {
    expect(saysWhen(seconds('2026-10-14T23:30:00Z'), { now: NOW })).toBe('Thu 15 Oct, 00:30')
  })

  test('01:00 belongs to the night before, and the helper says so when given the night', () => {
    const at = seconds('2026-10-15T00:00:00Z')
    expect(saysWhen(at, { now: NOW })).toBe('Thu 15 Oct, 01:00')
    expect(saysDay(showNightOf(new Date(at * 1000)), { now: NOW })).toBe('Wed 14 Oct')
  })

  test('04:00 is the first hour of its own night', () => {
    const at = seconds('2026-10-15T03:00:00Z')
    expect(saysWhen(at, { now: NOW })).toBe('Thu 15 Oct, 04:00')
    expect(saysDay(showNightOf(new Date(at * 1000)), { now: NOW })).toBe('Thu 15 Oct')
  })
})
