// Periods line up with the financial year and follow on from one another.
import { describe, expect, it } from 'vitest'
import { periodContaining, periodLabel } from '../../server/periods'

describe('periodContaining', () => {
  it('gives calendar months when the year starts on the first of a month', () => {
    expect(periodContaining('2026-11-16', 1, '08-01')).toEqual({ startsOn: '2026-11-01', endsOn: '2026-11-30' })
    expect(periodContaining('2028-02-29', 1, '08-01')).toEqual({ startsOn: '2028-02-01', endsOn: '2028-02-29' })
  })

  it('aligns quarters to the year\'s start', () => {
    expect(periodContaining('2026-11-16', 3, '08-01')).toEqual({ startsOn: '2026-11-01', endsOn: '2027-01-31' })
    expect(periodContaining('2026-10-31', 3, '08-01')).toEqual({ startsOn: '2026-08-01', endsOn: '2026-10-31' })
    expect(periodContaining('2027-01-05', 3, '01-01')).toEqual({ startsOn: '2027-01-01', endsOn: '2027-03-31' })
  })

  it('runs from the year\'s start day when it is not the first', () => {
    expect(periodContaining('2026-04-05', 1, '04-06')).toEqual({ startsOn: '2026-03-06', endsOn: '2026-04-05' })
    expect(periodContaining('2026-04-06', 1, '04-06')).toEqual({ startsOn: '2026-04-06', endsOn: '2026-05-05' })
    expect(periodContaining('2027-01-02', 3, '04-06')).toEqual({ startsOn: '2026-10-06', endsOn: '2027-01-05' })
  })
})

describe('periodLabel', () => {
  it('names a calendar month, a run of months, or a span of dates', () => {
    expect(periodLabel('2026-10-01', '2026-10-31')).toBe('October 2026')
    expect(periodLabel('2026-11-01', '2027-01-31')).toBe('Nov 2026 to Jan 2027')
    expect(periodLabel('2026-04-06', '2026-05-05')).toBe('6 Apr 2026 to 5 May 2026')
  })
})
