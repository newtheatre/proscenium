import { describe, expect, test } from 'bun:test'
import { addWorkingDays, coversThrough, isWorkingDay, lastCovered, workingDaysBetween } from '#shared/utils/working-days'

// C-121, decision 0038. Notice is counted over the gap before a booking, never over the booking
// itself, and a calendar that has run out refuses rather than guessing.

// Easter 2027 is 28 March, so Good Friday is the 26th and Easter Monday the 29th.
const HOLIDAYS = ['2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03']

const day = (iso: string): Date => new Date(`${iso}T12:00:00Z`)

describe('which days count', () => {
  test('an ordinary weekday counts', () => {
    expect(isWorkingDay(day('2027-03-24'), HOLIDAYS)).toBe(true)
  })

  test('a Saturday and a Sunday do not', () => {
    expect(isWorkingDay(day('2027-03-27'), HOLIDAYS)).toBe(false)
    expect(isWorkingDay(day('2027-03-28'), HOLIDAYS)).toBe(false)
  })

  test('a bank holiday does not, even on a weekday', () => {
    expect(isWorkingDay(day('2027-03-26'), HOLIDAYS)).toBe(false)
    expect(isWorkingDay(day('2027-03-29'), HOLIDAYS)).toBe(false)
  })

  // Read in London, not UTC. Late on a British Summer Time Friday it is already Saturday here,
  // and counting it as the Friday would hand out a working day nobody worked (0014).
  test('a date is read in London, not in UTC', () => {
    expect(isWorkingDay(new Date('2027-06-04T22:30:00Z'), HOLIDAYS)).toBe(true)
    expect(isWorkingDay(new Date('2027-06-04T23:30:00Z'), HOLIDAYS)).toBe(false)
  })
})

describe('counting the gap', () => {
  test('Monday to Thursday is three working days', () => {
    expect(workingDaysBetween(day('2027-03-22'), day('2027-03-25'), HOLIDAYS)).toBe(3)
  })

  // The whole reason the rule is not "three days": a Friday ask for the Monday reads as three
  // calendar days and one working one.
  test('a weekend in the gap does not count', () => {
    expect(workingDaysBetween(day('2027-03-19'), day('2027-03-22'), HOLIDAYS)).toBe(1)
  })

  test('a bank holiday in the gap does not count either', () => {
    expect(workingDaysBetween(day('2027-03-24'), day('2027-03-30'), HOLIDAYS)).toBe(2)
  })

  test('the same day is no notice at all', () => {
    expect(workingDaysBetween(day('2027-03-24'), day('2027-03-24'), HOLIDAYS)).toBe(0)
  })

  test('a booking already past counts as nothing rather than as negative notice', () => {
    expect(workingDaysBetween(day('2027-03-24'), day('2027-03-22'), HOLIDAYS)).toBe(0)
  })

  // The clocks going forward makes three London days 71 hours, which block arithmetic gets wrong.
  test('a clock change in the gap does not eat a day', () => {
    expect(workingDaysBetween(day('2027-03-25'), day('2027-03-31'), HOLIDAYS)).toBe(2)
  })
})

describe('the date a form has to go in by', () => {
  test('three working days before a Wednesday is the Friday before', () => {
    expect(addWorkingDays(day('2027-03-24'), -3, HOLIDAYS).toISOString().slice(0, 10)).toBe('2027-03-19')
  })

  // Good Friday, the weekend and Easter Monday all pass without counting, so three working days
  // before the Wednesday after Easter is the Wednesday before it.
  test('and it steps over a bank holiday', () => {
    expect(addWorkingDays(day('2027-03-31'), -3, HOLIDAYS).toISOString().slice(0, 10)).toBe('2027-03-24')
  })
})

describe('a calendar that has run out refuses rather than guessing', () => {
  test('the last date it covers is the last date in it', () => {
    expect(lastCovered(HOLIDAYS)).toBe('2027-05-03')
  })

  test('an empty list covers nothing at all', () => {
    expect(lastCovered([])).toBeNull()
    expect(coversThrough([], day('2027-03-24'))).toBe(false)
  })

  test('a date inside the list is covered, one past its end is not', () => {
    expect(coversThrough(HOLIDAYS, day('2027-05-03'))).toBe(true)
    expect(coversThrough(HOLIDAYS, day('2027-05-04'))).toBe(false)
  })

  // Counting an uncovered day as a working day is what grants less notice than the rule asks
  // for, so the caller is told it cannot know rather than being handed a number.
  test('an unsorted list is still read by its furthest date', () => {
    expect(lastCovered(['2027-05-03', '2026-12-25'])).toBe('2027-05-03')
  })
})
