// Days and times (the unified promotions design, the bar slice): a promotion can run only in set
// windows of the week, such as a happy hour, in the theatre's time zone. A window names its days and
// a start and end time; one that ends at or before it starts runs past midnight into the next day,
// and still counts as the day it started. No schedule means any time its dates allow.
import { z } from 'zod'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/ // not-policy: a time of day, HH:MM
const DAYS = 7 // not-policy: the days of the week

export const scheduleWindow = z.object({
  /** ISO weekdays: 1 is Monday, 7 is Sunday. */
  days: z.array(z.number().int().min(1).max(DAYS)).min(1).max(DAYS),
  from: z.string().regex(TIME, 'A time such as 17:00.'),
  until: z.string().regex(TIME, 'A time such as 19:00.'),
}).strict()
export const scheduleInput = z.array(scheduleWindow).min(1).max(14) // not-policy: two windows a day
export type Schedule = z.infer<typeof scheduleInput>

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) // not-policy: HH:MM in minutes

/** The weekday (1 to 7, Monday first) and minute of the day of an instant in a time zone. */
export function localWeekMinute(at: number, timeZone: string): { day: number, minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) } // not-policy: minutes in an hour
}

/** Whether an instant falls in any window of a schedule; true with no schedule. */
export function inSchedule(schedule: Schedule | null, at: number, timeZone: string): boolean {
  if (!schedule) return true
  const { day, minute } = localWeekMinute(at, timeZone)
  const yesterday = day === 1 ? DAYS : day - 1
  return schedule.some((w) => {
    const from = minutesOf(w.from)
    const until = minutesOf(w.until)
    if (from < until) return w.days.includes(day) && minute >= from && minute < until
    // Past midnight: the evening of a day named, or the small hours after one.
    return (w.days.includes(day) && minute >= from) || (w.days.includes(yesterday) && minute < until)
  })
}

/** A stored schedule; null when there is none, and no window at all when it cannot be read, so it never runs by mistake. */
export function parseSchedule(stored: string | null): Schedule | null {
  if (!stored) return null
  try {
    const parsed = scheduleInput.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : []
  }
  catch {
    return []
  }
}
