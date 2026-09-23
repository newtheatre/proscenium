import { describe, expect, test } from 'bun:test'
import { calendarYearChoices, monthChoices, saysYear, yearChoices, YEARS_OFFERED } from '#shared/utils/year'

// What the money screens offer instead of a number spinner (I-105 criterion 6, K-123 criterion 2).

describe('a year is chosen from a list (I-105 criterion 6, 0087)', () => {
  test('the list runs back from the year given, newest first', () => {
    expect(yearChoices(2026).map(choice => choice.value)).toEqual([2026, 2025, 2024, 2023, 2022, 2021])
  })

  test('the list is as long as the constant says', () => {
    expect(yearChoices(2026)).toHaveLength(YEARS_OFFERED)
  })

  test('a year is named by the two calendar years it spans, not by the year it ends', () => {
    expect(saysYear(2026)).toBe('2025/26')
    expect(yearChoices(2026)[0]!.label).toBe('2025/26')
  })

  test('the turn of the century still reads as two years', () => {
    expect(saysYear(2100)).toBe('2099/2100')
  })
})

describe('a month carries a calendar year, not a 1 August year (I-105 criterion 6)', () => {
  test('a calendar year reads as one year', () => {
    expect(calendarYearChoices(2026)[0]).toEqual({ label: '2026', value: 2026 })
  })

  test('the list runs back the same depth as the years', () => {
    expect(calendarYearChoices(2026)).toHaveLength(YEARS_OFFERED)
    expect(calendarYearChoices(2026).at(-1)!.value).toBe(2021)
  })
})

describe('a month is chosen from a list (K-123 criterion 2)', () => {
  test('twelve months, numbered the way the period query takes them', () => {
    expect(monthChoices()).toHaveLength(12)
    expect(monthChoices()[0]).toEqual({ label: 'January', value: 1 })
    expect(monthChoices()[11]).toEqual({ label: 'December', value: 12 })
  })

  test('the names are London English, not the runtime locale', () => {
    expect(monthChoices()[8]!.label).toBe('September')
  })
})
