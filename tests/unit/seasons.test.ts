import { describe, expect, test } from 'bun:test'
import { archiveSeasonForm, seasonForm } from '#shared/utils/seasons'

// D-131's season form: a London day range and the order it is presented in (criterion 2).

describe('a season needs a name and a real window', () => {
  test('a name and two civil days are required', () => {
    expect(seasonForm.safeParse({ name: '2026/27', startsOn: '2026-08-01', endsOn: '2027-07-31' }).success).toBe(true)
  })

  test('a day that is not YYYY-MM-DD is refused', () => {
    expect(seasonForm.safeParse({ name: '2026/27', startsOn: '01/08/2026', endsOn: '2027-07-31' }).success).toBe(false)
  })

  test('a season ends after it starts', () => {
    expect(seasonForm.safeParse({ name: '2026/27', startsOn: '2026-08-01', endsOn: '2026-08-01' }).success).toBe(false)
    expect(seasonForm.safeParse({ name: '2026/27', startsOn: '2026-08-01', endsOn: '2026-07-31' }).success).toBe(false)
  })

  test('sort defaults to nought', () => {
    expect(seasonForm.parse({ name: '2026/27', startsOn: '2026-08-01', endsOn: '2027-07-31' }).sort).toBe(0)
  })
})

describe('retiring is its own action', () => {
  test('the archive form takes a plain boolean', () => {
    expect(archiveSeasonForm.parse({ archived: true })).toEqual({ archived: true })
    expect(archiveSeasonForm.safeParse({}).success).toBe(false)
  })
})
