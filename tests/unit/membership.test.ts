import { describe, expect, test } from 'bun:test'
import { daysAfter, endOfTerm, isCurrent, isInGrace, londonDay } from '#shared/utils/membership'

// A membership is a term bought at the SU, so every question about it is a question about dates
// (0031). These are the sums the register and the sweep both rely on.

describe('a term runs from the day it was bought (0031)', () => {
  test('a year ends the day before the anniversary, not on it', () => {
    expect(endOfTerm('2026-09-14', 1)).toBe('2027-09-13')
    expect(endOfTerm('2026-09-14', 3)).toBe('2029-09-13')
  })

  test('it survives a leap day rather than landing on one that does not exist', () => {
    expect(endOfTerm('2024-02-29', 1)).toBe('2025-02-28')
  })

  test('it crosses a year end without inventing a day', () => {
    expect(endOfTerm('2026-01-01', 1)).toBe('2026-12-31')
    expect(daysAfter('2026-12-28', 5)).toBe('2027-01-02')
  })
})

describe('current means inside the term or its grace (A-117 criterion 3)', () => {
  const term = { startsOn: '2026-09-14', expiresOn: '2027-09-13' }

  test('the first and last day both count', () => {
    expect(isCurrent(term, '2026-09-14', 0)).toBe(true)
    expect(isCurrent(term, '2027-09-13', 0)).toBe(true)
  })

  test('the day before it starts does not', () => {
    expect(isCurrent(term, '2026-09-13', 14)).toBe(false)
  })

  test('the grace window extends it and says so', () => {
    expect(isCurrent(term, '2027-09-20', 14)).toBe(true)
    expect(isInGrace(term, '2027-09-20', 14)).toBe(true)
    expect(isInGrace(term, '2027-09-01', 14)).toBe(false)
    expect(isCurrent(term, '2027-09-28', 14)).toBe(false)
  })

  // A grace window of nothing is a membership that ends when it ends.
  test('no grace means no grace', () => {
    expect(isCurrent(term, '2027-09-14', 0)).toBe(false)
  })
})

describe('the London day is the civil date, not the machine one (0014)', () => {
  test('an instant just before midnight London is still that day', () => {
    expect(londonDay(new Date('2026-06-14T22:30:00Z'))).toBe('2026-06-14')
    // 23:30 UTC in summer is 00:30 the next day in London.
    expect(londonDay(new Date('2026-06-14T23:30:00Z'))).toBe('2026-06-15')
  })
})
