import { describe, expect, test } from 'bun:test'
import { reportPeriodForm } from '#shared/utils/bar-reports'

// F-119's pure vocabulary. Period resolution and the report queries have their own tests in
// tests/e2e/bar-reports.test.ts, against a real database.

describe('a report period names one shape per kind', () => {
  test('a night needs a night', () => {
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT', night: '2026-09-09' }).success).toBe(true)
    expect(reportPeriodForm.safeParse({ kind: 'NIGHT' }).success).toBe(false)
  })

  test('a week needs a day', () => {
    expect(reportPeriodForm.safeParse({ kind: 'WEEK', day: '2026-09-09' }).success).toBe(true)
    expect(reportPeriodForm.safeParse({ kind: 'WEEK' }).success).toBe(false)
  })

  test('a season needs a year, coerced from a query string', () => {
    const parsed = reportPeriodForm.safeParse({ kind: 'SEASON', year: '2027' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.kind === 'SEASON' && parsed.data.year).toBe(2027)
  })

  test('a custom range needs both ends', () => {
    expect(reportPeriodForm.safeParse({ kind: 'CUSTOM', from: '2026-09-01', to: '2026-09-30' }).success).toBe(true)
    expect(reportPeriodForm.safeParse({ kind: 'CUSTOM', from: '2026-09-01' }).success).toBe(false)
  })

  test('an unknown kind is refused', () => {
    expect(reportPeriodForm.safeParse({ kind: 'YEAR', from: '2026-09-01' }).success).toBe(false)
  })
})
