import { describe, expect, test } from 'bun:test'
import { awardFellowship, manualEntryForm, recordMembership } from '#shared/utils/admin-forms'
import { MANUAL_ACTION_NAMES } from '#shared/utils/audit-actions'
import { daysAfter, endOfTerm, isCurrent, isInGrace, londonDay, londonDayField } from '#shared/utils/membership'
import type { ZodType } from 'zod'

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

// A form sent with its date left empty named nothing in particular, on the fellowship, membership
// and audit screens alike, since they share the one day field (K-128 criterion 2).
describe('a missing date asks for one, on every form that shares the day field', () => {
  const messageAt = (schema: ZodType, input: unknown, path: string): string | undefined => {
    const result = schema.safeParse(input)
    return result.success ? undefined : result.error.issues.find(issue => issue.path.join('.') === path)?.message
  }

  test('no date, or an empty one, asks for a date', () => {
    expect(messageAt(londonDayField, undefined, '')).toBe('Choose a date')
    expect(messageAt(londonDayField, '', '')).toBe('Choose a date')
  })

  test('a date in the wrong shape, or one the calendar lacks, keeps its own message', () => {
    expect(messageAt(londonDayField, '14/09/2026', '')).toBe('Give the date as YYYY-MM-DD')
    expect(messageAt(londonDayField, '2026-02-31', '')).toBe('That is not a day on the calendar')
  })

  test('the fellowship, membership and audit forms each say so at their date', () => {
    expect(messageAt(awardFellowship, { userId: 'u1', awardedBy: 'The AGM', citation: 'For everything' }, 'awardedOn')).toBe('Choose a date')
    expect(messageAt(recordMembership, { userId: 'u1', years: 1 }, 'startsOn')).toBe('Choose a date')
    expect(messageAt(manualEntryForm, { action: MANUAL_ACTION_NAMES[0], target: 'u1', onBehalfOf: 'u2' }, 'occurredOn')).toBe('Choose a date')
  })
})
