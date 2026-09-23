import { describe, expect, test } from 'bun:test'
import { reportPeriodForm, saysPageOf } from '#shared/utils/bar-reports'
import { fromLondonWallClock } from '#shared/utils/london'
import { resolveReportPeriod } from '#server/utils/bar-reports'

// F-119's pure vocabulary and the period resolution it feeds. The report queries themselves are
// tested in tests/e2e/bar-reports.test.ts, against a real database.

const HOUR = 60 * 60
const at = (year: number, month: number, day: number, hour = 0): number =>
  Math.floor(fromLondonWallClock(year, month, day, hour).getTime() / 1000)
const hours = (period: { fromAt: number, toAt: number }): number => (period.toAt - period.fromAt) / HOUR

describe('a report period names one shape per kind', () => {
  test('a night needs a night', () => {
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT', night: '2026-09-09' }).success).toBe(true)
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT' }).success).toBe(false)
  })

  test('a week needs a day', () => {
    expect(reportPeriodForm.safeParse({ kind: 'WEEK', day: '2026-09-09' }).success).toBe(true)
    expect(reportPeriodForm.safeParse({ kind: 'WEEK' }).success).toBe(false)
  })

  test('a year needs the year it ends in, coerced from a query string (0087)', () => {
    const parsed = reportPeriodForm.safeParse({ kind: 'YEAR', year: '2027' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.kind === 'YEAR' && parsed.data.year).toBe(2027)
  })

  test('the whole year is never called a season (0087)', () => {
    expect(reportPeriodForm.safeParse({ kind: 'SEASON', year: '2027' }).success).toBe(false)
  })

  test('a custom range needs both ends', () => {
    expect(reportPeriodForm.safeParse({ kind: 'CUSTOM', from: '2026-09-01', to: '2026-09-30' }).success).toBe(true)
    expect(reportPeriodForm.safeParse({ kind: 'CUSTOM', from: '2026-09-01' }).success).toBe(false)
  })

  test('an unknown kind is refused', () => {
    expect(reportPeriodForm.safeParse({ kind: 'YEAR', from: '2026-09-01' }).success).toBe(false)
  })
})

describe('a date that is not a day is refused (F-119 criterion 1, 0014)', () => {
  test('2026-13-45 has the shape and names no day', () => {
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT', night: '2026-13-45' }).success).toBe(false)
    expect(reportPeriodForm.safeParse({ kind: 'WEEK', day: '2026-13-45' }).success).toBe(false)
    expect(reportPeriodForm.safeParse({ kind: 'CUSTOM', from: '2026-13-45', to: '2026-13-45' }).success).toBe(false)
  })

  test('a day that only exists in a leap year is judged against the year given', () => {
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT', night: '2026-02-29' }).success).toBe(false)
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT', night: '2028-02-29' }).success).toBe(true)
  })
})

describe('resolveReportPeriod bounds every kind on the London calendar (F-119 criterion 1, 0014)', () => {
  test('a night is 04:00 to 04:00 the next morning (0014)', () => {
    expect(resolveReportPeriod({ kind: 'NIGHT', night: '2026-09-09' })).toEqual({
      fromAt: at(2026, 9, 9, 4),
      toAt: at(2026, 9, 10, 4),
    })
  })

  test('a week is the seven London days starting on the day named, exclusive at the end', () => {
    const period = resolveReportPeriod({ kind: 'WEEK', day: '2026-09-07' })
    expect(period).toEqual({ fromAt: at(2026, 9, 7), toAt: at(2026, 9, 14) })
    expect(hours(period)).toBe(168)
  })

  test('a year is 1 August to the following 31 July, London', () => {
    expect(resolveReportPeriod({ kind: 'YEAR', year: 2027 })).toEqual({
      fromAt: at(2026, 8, 1),
      toAt: at(2027, 8, 1),
    })
  })

  test('a custom range covers both named days whole', () => {
    expect(resolveReportPeriod({ kind: 'CUSTOM', from: '2026-09-01', to: '2026-09-30' })).toEqual({
      fromAt: at(2026, 9, 1),
      toAt: at(2026, 10, 1),
    })
  })

  test('a custom range that ends before it starts is refused', () => {
    expect(() => resolveReportPeriod({ kind: 'CUSTOM', from: '2026-09-30', to: '2026-09-01' })).toThrow()
  })

  test('a week over the October change is 169 hours, so the busiest hour of the year is not dropped', () => {
    const period = resolveReportPeriod({ kind: 'WEEK', day: '2026-10-19' })
    expect(period.toAt).toBe(at(2026, 10, 26))
    expect(hours(period)).toBe(169)
  })

  test('a week over the March change is 167 hours, so it does not reach into the next day', () => {
    const period = resolveReportPeriod({ kind: 'WEEK', day: '2026-03-23' })
    expect(period.toAt).toBe(at(2026, 3, 30))
    expect(hours(period)).toBe(167)
  })

  test('a range ending on 25 October 2026 covers all 25 hours of it', () => {
    const period = resolveReportPeriod({ kind: 'CUSTOM', from: '2026-10-25', to: '2026-10-25' })
    expect(period.toAt).toBe(at(2026, 10, 26))
    expect(hours(period)).toBe(25)
  })

  test('a range ending on 29 March 2026 covers its 23 hours and no more', () => {
    const period = resolveReportPeriod({ kind: 'CUSTOM', from: '2026-03-29', to: '2026-03-29' })
    expect(period.toAt).toBe(at(2026, 3, 30))
    expect(hours(period)).toBe(23)
  })
})

describe('a section that does not fit says so rather than reading as the whole (F-119 criterion 2)', () => {
  const page = (items: number, pageNumber: number, total: number) =>
    ({ items: Array.from({ length: items }, (_, index) => index), page: pageNumber, pageSize: 25, total, pages: Math.ceil(total / 25) })

  test('the first page names where it starts, where it ends and the whole', () => {
    expect(saysPageOf(page(25, 1, 212))).toBe('Showing 1 to 25 of 212. Narrow the period to see the rest.')
  })

  test('a page past the last says so rather than counting backwards', () => {
    expect(saysPageOf(page(0, 99, 212))).toBe('Nothing on this page. There are 212 in the period.')
  })

  test('a later page counts from its own offset', () => {
    expect(saysPageOf(page(12, 9, 212))).toBe('Showing 201 to 212 of 212. Narrow the period to see the rest.')
  })
})
