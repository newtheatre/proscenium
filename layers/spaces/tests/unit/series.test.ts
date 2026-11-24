// The dates a series falls on (rules R2, R3, R8), worked out on calendar dates.
import { describe, expect, it } from 'vitest'
import { seriesDates, weekdayOf } from '../../shared/series'

describe('seriesDates', () => {
  it('runs weekly on the first date\'s weekday, or on the weekdays given', () => {
    expect(seriesDates({ frequency: 'weekly', first: '2027-01-12', last: '2027-02-02' })).toEqual(['2027-01-12', '2027-01-19', '2027-01-26', '2027-02-02'])
    expect(seriesDates({ frequency: 'weekly', first: '2027-01-11', last: '2027-01-17', weekdays: [2, 4] })).toEqual(['2027-01-12', '2027-01-14'])
  })

  it('runs fortnightly from the first date\'s week, and daily on every day', () => {
    expect(seriesDates({ frequency: 'fortnightly', first: '2027-01-12', last: '2027-02-10' })).toEqual(['2027-01-12', '2027-01-26', '2027-02-09'])
    expect(seriesDates({ frequency: 'daily', first: '2027-03-27', last: '2027-03-29' })).toEqual(['2027-03-27', '2027-03-28', '2027-03-29'])
  })

  it('runs monthly on the same weekday of the month, skipping a month without it (R8)', () => {
    expect(seriesDates({ frequency: 'monthly-by-weekday', first: '2027-01-12', last: '2027-04-30' })).toEqual(['2027-01-12', '2027-02-09', '2027-03-09', '2027-04-13'])
    // The fifth Friday: January 2027 has one, February and March do not, April has one.
    expect(seriesDates({ frequency: 'monthly-by-weekday', first: '2027-01-29', last: '2027-04-30' })).toEqual(['2027-01-29', '2027-04-30'])
  })

  it('stops at the limit, and gives nothing for a range that runs backwards', () => {
    expect(seriesDates({ frequency: 'daily', first: '2027-01-01', last: '2030-01-01' }, 3)).toHaveLength(3)
    expect(seriesDates({ frequency: 'daily', first: '2027-01-02', last: '2027-01-01' })).toEqual([])
    expect(weekdayOf('2027-01-17')).toBe(7)
  })
})
