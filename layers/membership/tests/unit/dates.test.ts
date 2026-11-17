// The date rules D1, D6 and D8 (Membership specification, tab 3), with the specification's own examples.
import { describe, expect, it } from 'vitest'
import { derivedStatus, endsOnFor } from '../../server/dates'

const fixed = { lengthRule: 'fixed' as const, fixedEndMonth: 7, fixedEndDay: 31, rolloverDays: 60 }

describe('end dates', () => {
  it('runs a fixed scheme to the next end date, and a year further inside the rollover', () => {
    expect(endsOnFor(fixed, '2026-10-10')).toBe('2027-07-31')
    expect(endsOnFor(fixed, '2027-06-20')).toBe('2028-07-31')
    expect(endsOnFor({ ...fixed, rolloverDays: 0 }, '2027-07-31')).toBe('2027-07-31')
  })

  it('counts scheme years for a fixed scheme', () => {
    expect(endsOnFor(fixed, '2026-10-10', 1)).toBe('2027-07-31')
    expect(endsOnFor(fixed, '2026-10-10', 3)).toBe('2029-07-31')
  })

  it('counts months for a rolling scheme, less one day', () => {
    const rolling = { lengthRule: 'rolling' as const }
    expect(endsOnFor(rolling, '2026-11-17', 12)).toBe('2027-11-16')
    expect(endsOnFor(rolling, '2026-11-17', 36)).toBe('2029-11-16')
    expect(endsOnFor(rolling, '2026-01-01', 1)).toBe('2026-01-31')
    // A start on the 31st into a shorter month ends on that month's last day.
    expect(endsOnFor(rolling, '2027-01-31', 1)).toBe('2027-02-28')
    expect(endsOnFor(rolling, '2028-01-31', 1)).toBe('2028-02-29')
  })

  it('gives an indefinite scheme no end', () => {
    expect(endsOnFor({ lengthRule: 'indefinite' }, '2026-11-17')).toBeNull()
  })
})

describe('derived status', () => {
  const m = { startsOn: '2026-11-17', endsOn: '2027-07-31' }
  it('reads upcoming, current, in grace and lapsed from the dates alone', () => {
    expect(derivedStatus(m, 30, '2026-11-16')).toBe('upcoming')
    expect(derivedStatus(m, 30, '2027-07-31')).toBe('current')
    expect(derivedStatus(m, 30, '2027-08-30')).toBe('in-grace')
    expect(derivedStatus(m, 30, '2027-08-31')).toBe('lapsed')
    expect(derivedStatus(m, 0, '2027-08-01')).toBe('lapsed')
    expect(derivedStatus({ startsOn: '2026-01-01', endsOn: null }, 0, '2090-01-01')).toBe('current')
  })
})
