import { z } from 'zod'
import { fromLondonWallClock, londonWeekday } from './london'

// A term of rehearsals as one action (C-110). The arithmetic walks calendar days, never
// milliseconds: adding those moves a 19:00 rehearsal by an hour twice a year (criterion 4, 0014).

export const FREQUENCIES = ['DAILY', 'WEEKLY'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const DAY = /^\d{4}-\d{2}-\d{2}$/
export const CLOCK = /^\d{2}:\d{2}$/

export interface Recurrence {
  frequency: Frequency
  // Which London weekdays a weekly series falls on, Sunday nought. Empty for a daily one.
  weekdays: number[]
  startsOn: string
  from: string
  to: string
  occurrences: number
}

export interface Occurrence {
  occurrence: number
  day: string
  startsAt: Date
  endsAt: Date
}

function partsOf(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number)
  return [year!, month!, date!]
}

function clockOf(clock: string): [number, number] {
  const [hour, minute] = clock.split(':').map(Number)
  return [hour!, minute!]
}

// Calendar arithmetic on the date itself, never on an instant: the day after a clock change is
// the next date, whether that day was 23 hours long or 25.
export function addDays(day: string, count: number): string {
  const [year, month, date] = partsOf(day)
  const moved = new Date(Date.UTC(year, month - 1, date + count))
  return moved.toISOString().slice(0, 10)
}

// The London weekday a date falls on, asked at midday so no clock change can move the answer.
export function weekdayOf(day: string): number {
  const [year, month, date] = partsOf(day)
  return londonWeekday(fromLondonWallClock(year, month, date, 12))
}

// A booking ending before it starts is a form error, so a span that wraps midnight is refused
// rather than silently landing on the next day.
export function expand(recurrence: Recurrence): Occurrence[] {
  const [fromHour, fromMinute] = clockOf(recurrence.from)
  const [toHour, toMinute] = clockOf(recurrence.to)
  const wanted = recurrence.frequency === 'WEEKLY' ? new Set(recurrence.weekdays) : null

  const found: Occurrence[] = []
  let day = recurrence.startsOn
  // A weekly series may start on a day it does not fall on, so the walk is bounded by the days
  // it could cover rather than by the count alone.
  const ceiling = recurrence.occurrences * 7 + 7

  for (let step = 0; step < ceiling && found.length < recurrence.occurrences; step++) {
    if (!wanted || wanted.has(weekdayOf(day))) {
      const [year, month, date] = partsOf(day)
      found.push({
        occurrence: found.length + 1,
        day,
        startsAt: fromLondonWallClock(year, month, date, fromHour, fromMinute),
        endsAt: fromLondonWallClock(year, month, date, toHour, toMinute),
      })
    }
    day = addDays(day, 1)
  }

  return found
}

export const seriesForm = z.object({
  roomId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  attendees: z.number().int().positive().nullish().transform(value => value ?? null),
  tier: z.enum(['PRODUCTION', 'COMMITTEE', 'REHEARSAL', 'GENERAL']).default('GENERAL'),
  purpose: z.string().trim().min(1, 'Say what the room is for').max(32),
  notes: z.string().trim().max(1000).nullish().transform(value => (value ?? '').trim() || null),
  frequency: z.enum(FREQUENCIES),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  startsOn: z.string().regex(DAY, 'Choose a day to start on'),
  from: z.string().regex(CLOCK, 'Choose a start time'),
  to: z.string().regex(CLOCK, 'Choose an end time'),
  occurrences: z.number().int().positive(),
  // Occurrences the member has chosen to leave out, so a series refused for two weeks can be
  // resubmitted without them (criterion 3).
  skip: z.array(z.string().regex(DAY)).default([]),
})
  .refine(series => series.to > series.from, {
    path: ['to'],
    message: 'A booking ends after it starts',
  })
  .refine(series => series.frequency !== 'WEEKLY' || series.weekdays.length > 0, {
    path: ['weekdays'],
    message: 'Choose which days of the week it falls on',
  })

export type SeriesInput = z.output<typeof seriesForm>

export function saysRecurrence(recurrence: Recurrence): string {
  const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
  if (recurrence.frequency === 'DAILY') return `Every day, ${recurrence.occurrences} times`
  const days = [...recurrence.weekdays].sort().map(weekday => names[weekday]).join(' and ')
  return `${days}, ${recurrence.occurrences} times`
}
