// Days and times (the unified promotions design, the bar slice): a promotion runs only in its windows
// of the week, in the theatre's time zone, and a window that ends before it starts runs past midnight.
import { describe, expect, it } from 'vitest'
import { inSchedule, localWeekMinute, parseSchedule } from '../../server/schedule'

const LONDON = 'Europe/London'
// Wednesday 18 November 2026 (GMT, so London is UTC).
const wed = (hh: number, mm = 0) => Date.UTC(2026, 10, 18, hh, mm)

describe('days and times', () => {
  it('reads the weekday and minute where the theatre is', () => {
    expect(localWeekMinute(wed(17, 30), LONDON)).toEqual({ day: 3, minute: 17 * 60 + 30 })
    // In summer London is an hour ahead: 23:30 UTC on a Saturday is 00:30 on Sunday.
    expect(localWeekMinute(Date.UTC(2026, 6, 4, 23, 30), LONDON)).toEqual({ day: 7, minute: 30 })
  })

  it('runs any time with no schedule, and only inside a window with one', () => {
    expect(inSchedule(null, wed(3), LONDON)).toBe(true)
    const happyHour = [{ days: [1, 2, 3, 4, 5], from: '17:00', until: '19:00' }]
    expect(inSchedule(happyHour, wed(17), LONDON)).toBe(true)
    expect(inSchedule(happyHour, wed(18, 59), LONDON)).toBe(true)
    expect(inSchedule(happyHour, wed(19), LONDON)).toBe(false)
    expect(inSchedule(happyHour, wed(16, 59), LONDON)).toBe(false)
    expect(inSchedule([{ days: [6, 7], from: '17:00', until: '19:00' }], wed(17), LONDON)).toBe(false)
  })

  it('runs a late window past midnight as the day it started', () => {
    const late = [{ days: [3], from: '22:00', until: '01:00' }]
    expect(inSchedule(late, wed(23), LONDON)).toBe(true)
    expect(inSchedule(late, Date.UTC(2026, 10, 19, 0, 30), LONDON)).toBe(true) // Thursday, small hours
    expect(inSchedule(late, Date.UTC(2026, 10, 19, 1, 0), LONDON)).toBe(false)
    expect(inSchedule(late, wed(0, 30), LONDON)).toBe(false) // Tuesday's small hours
    // Until midnight is the evening only.
    expect(inSchedule([{ days: [3], from: '20:00', until: '00:00' }], Date.UTC(2026, 10, 19, 0, 0), LONDON)).toBe(false)
  })

  it('never runs a schedule it cannot read', () => {
    expect(parseSchedule(null)).toBeNull()
    expect(parseSchedule('not json')).toEqual([])
    expect(inSchedule(parseSchedule('[{"days":[9],"from":"1","until":"2"}]'), wed(17), LONDON)).toBe(false)
  })
})
