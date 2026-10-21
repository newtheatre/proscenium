import { describe, expect, test } from 'bun:test'
import { showNightOf } from '#shared/utils/show-night'
import { saysClock, saysDay, saysDayLong, saysDayRange, saysMonthDay, saysWhen, saysWhenLong } from '#shared/utils/when'

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

// A yearly boundary has no year, so it reads as a day and a month and never as MM-DD (issue 1266).
describe('a day of the year reads as a day and a month', () => {
  test('a boundary is said the way a person says it', () => {
    expect(saysMonthDay('08-01')).toBe('1 August')
    expect(saysMonthDay('07-31')).toBe('31 July')
    expect(saysMonthDay('02-28')).toBe('28 February')
  })

  test('something that is not a day of the year is left as it was', () => {
    expect(saysMonthDay('02-29')).toBe('02-29')
    expect(saysMonthDay('')).toBe('')
  })
})

// Chrome's ICU puts a comma after the weekday where the server's does not, so a shape that let
// the locale join its parts rendered "Tue 13 Oct" on the server and "Tue, 13 Oct" after hydration.
describe('the shapes are the same on the server and in every browser', () => {
  test('a runtime that joins the weekday with a comma still reads "Tue 13 Oct"', () => {
    const Native = Intl.DateTimeFormat
    const Commaed = function (locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
      const native = new Native(locale, options)
      const joined = Boolean(options?.weekday && (options.day || options.month))
      return {
        format: (at: Date) => (joined ? native.format(at).replace(/^(\w+) /, '$1, ') : native.format(at)),
        formatToParts: (at: Date) => native.formatToParts(at),
        resolvedOptions: () => native.resolvedOptions(),
      }
    } as unknown as typeof Intl.DateTimeFormat
    Intl.DateTimeFormat = Commaed
    try {
      expect(saysDay('2026-10-13', { now: NOW })).toBe('Tue 13 Oct')
      expect(saysWhen(seconds('2026-10-13T18:30:00Z'), { now: NOW })).toBe('Tue 13 Oct, 19:30')
      expect(saysDayLong('2026-10-13', { now: NOW })).toBe('Tuesday 13 October')
    }
    finally {
      Intl.DateTimeFormat = Native
    }
  })

  test('every month has one short name', () => {
    const names = Array.from({ length: 12 }, (_, index) => saysDay(`2026-${String(index + 1).padStart(2, '0')}-15`, { year: false }).split(' ')[2])
    expect(names).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'])
  })
})

// "Mon 8 Sept 2025 to Thu 3 Sept" read as ending before it began (0117).
describe('a span of days names its year when an end leaves this calendar year', () => {
  const OCTOBER = new Date('2026-10-14T10:00:00Z')

  test('a span inside this calendar year has no year', () => {
    expect(saysDayRange('2026-10-01', '2026-11-30', { now: OCTOBER })).toBe('Thu 1 Oct to Mon 30 Nov')
  })

  test('a span crossing the new year names both years', () => {
    expect(saysDayRange('2026-10-01', '2027-01-31', { now: OCTOBER })).toBe('Thu 1 Oct 2026 to Sun 31 Jan 2027')
    expect(saysDayRange('2025-09-08', '2026-09-03', { now: OCTOBER })).toBe('Mon 8 Sept 2025 to Thu 3 Sept 2026')
  })

  test('a span wholly in another year names it once, at the end', () => {
    expect(saysDayRange('2027-01-01', '2027-02-12', { now: OCTOBER })).toBe('Fri 1 Jan to Fri 12 Feb 2027')
  })
})
