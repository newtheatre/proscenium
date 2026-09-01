import { describe, expect, test } from 'bun:test'
import { addDays, expand, seriesForm, weekdayOf } from '#shared/utils/series'
import { londonClock } from '#shared/utils/london'

// C-110's pure half. Criterion 4 is the one that breaks silently, so both transitions are
// automated cases either side of the change rather than a note in a comment.

const weekly = {
  frequency: 'WEEKLY' as const,
  weekdays: [1],
  startsOn: '2026-03-16',
  from: '19:00',
  to: '21:00',
  occurrences: 4,
}

describe('a weekly series lands on the days it was asked for', () => {
  test('four Mondays are four Mondays', () => {
    const found = expand(weekly)
    expect(found).toHaveLength(4)
    expect(found.map(one => one.day)).toEqual(['2026-03-16', '2026-03-23', '2026-03-30', '2026-04-06'])
  })

  test('two days a week alternate, in order', () => {
    const found = expand({ ...weekly, weekdays: [1, 4], occurrences: 4 })
    expect(found.map(one => one.day)).toEqual(['2026-03-16', '2026-03-19', '2026-03-23', '2026-03-26'])
  })

  // A member picks the day the term starts, not the day their rehearsal falls on.
  test('a start that is not one of the chosen days waits for the first that is', () => {
    const found = expand({ ...weekly, startsOn: '2026-03-17', occurrences: 2 })
    expect(found.map(one => one.day)).toEqual(['2026-03-23', '2026-03-30'])
  })

  test('occurrences are numbered from one, in order', () => {
    expect(expand(weekly).map(one => one.occurrence)).toEqual([1, 2, 3, 4])
  })
})

describe('a daily series is every day', () => {
  test('five days running, including the weekend', () => {
    const found = expand({ ...weekly, frequency: 'DAILY', weekdays: [], startsOn: '2026-03-27', occurrences: 5 })
    expect(found.map(one => one.day)).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
  })

  test('it crosses a month end without arithmetic of its own', () => {
    const found = expand({ ...weekly, frequency: 'DAILY', weekdays: [], startsOn: '2026-01-30', occurrences: 3 })
    expect(found.map(one => one.day)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01'])
  })
})

// The whole reason this file is pure. In 2026 the clocks go forward on 29 March and back on
// 25 October, and a series spanning either must not move by an hour.
describe('a wall clock survives both transitions (criterion 4)', () => {
  test('a 19:00 Monday stays 19:00 across the spring change', () => {
    const found = expand({ ...weekly, startsOn: '2026-03-23', occurrences: 3 })
    expect(found.map(one => one.day)).toEqual(['2026-03-23', '2026-03-30', '2026-04-06'])
    for (const one of found) expect(londonClock(one.startsAt)).toBe('19:00')
  })

  test('and 19:00 across the autumn change', () => {
    const found = expand({ ...weekly, startsOn: '2026-10-19', occurrences: 3 })
    expect(found.map(one => one.day)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
    for (const one of found) expect(londonClock(one.startsAt)).toBe('19:00')
  })

  test('the end of each one holds its clock too', () => {
    for (const one of expand({ ...weekly, startsOn: '2026-03-23', occurrences: 3 })) {
      expect(londonClock(one.endsAt)).toBe('21:00')
    }
  })

  // The instants are not evenly spaced, which is the point: one week is 167 hours, not 168.
  test('the week containing the change is an hour shorter in real time', () => {
    const [first, second] = expand({ ...weekly, startsOn: '2026-03-23', occurrences: 2 })
    const hours = (second!.startsAt.getTime() - first!.startsAt.getTime()) / 3_600_000
    expect(hours).toBe(167)
  })

  test('and the autumn one an hour longer', () => {
    const [first, second] = expand({ ...weekly, startsOn: '2026-10-19', occurrences: 2 })
    const hours = (second!.startsAt.getTime() - first!.startsAt.getTime()) / 3_600_000
    expect(hours).toBe(169)
  })

  // 01:30 does not exist on the morning the clocks go forward; the helper resolves it rather
  // than returning an invalid date, so a series over it still expands.
  test('an hour that does not exist still yields a booking', () => {
    const found = expand({
      ...weekly,
      frequency: 'DAILY',
      weekdays: [],
      startsOn: '2026-03-28',
      from: '01:30',
      to: '03:30',
      occurrences: 3,
    })
    expect(found).toHaveLength(3)
    for (const one of found) expect(Number.isNaN(one.startsAt.getTime())).toBe(false)
  })
})

describe('calendar arithmetic', () => {
  test('a day is added as a date, not as a duration', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  test('it crosses a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('a leap day is a day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  test('a weekday is the London one', () => {
    expect(weekdayOf('2026-03-16')).toBe(1)
    expect(weekdayOf('2026-03-22')).toBe(0)
  })
})

describe('what a series may ask for', () => {
  const valid = {
    roomId: 'studio',
    title: 'Rehearsal',
    frequency: 'WEEKLY',
    weekdays: [1],
    startsOn: '2026-03-16',
    from: '19:00',
    to: '21:00',
    occurrences: 4,
  }

  test('a weekly series names its days', () => {
    expect(seriesForm.safeParse(valid).success).toBe(true)
    expect(seriesForm.safeParse({ ...valid, weekdays: [] }).success).toBe(false)
  })

  test('a daily one needs none', () => {
    expect(seriesForm.safeParse({ ...valid, frequency: 'DAILY', weekdays: [] }).success).toBe(true)
  })

  test('it ends after it starts', () => {
    expect(seriesForm.safeParse({ ...valid, from: '21:00', to: '19:00' }).success).toBe(false)
  })

  test('nought occurrences is not a series', () => {
    expect(seriesForm.safeParse({ ...valid, occurrences: 0 }).success).toBe(false)
  })

  test('a day that is not a day is refused', () => {
    expect(seriesForm.safeParse({ ...valid, startsOn: 'next Monday' }).success).toBe(false)
    expect(seriesForm.safeParse({ ...valid, weekdays: [7] }).success).toBe(false)
  })
})
