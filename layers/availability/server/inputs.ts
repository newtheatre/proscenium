// The shapes the routes accept (spec parts 2 and 3). Rules that need the database live in the services.
import { z } from 'zod'
import { LEVELS, UNMARKED } from '../shared/levels'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: YYYY-MM-DD
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/) // not-policy: HH:MM
const level = z.enum(LEVELS)

export const lineInput = z.object({ weekday: z.number().int().min(1).max(7), from: clock, until: clock, level }).strict() // not-policy: Monday 1 to Sunday 7

export const patternInput = z.object({
  label: z.string().trim().min(1).max(40), // not-policy: as the table's CHECK
  startsOn: date,
  endsOn: date.nullable(),
  lines: z.array(lineInput).max(200).optional(), // not-policy: a week of half-hours at most
}).strict()

export const exceptionInput = z.object({
  firstDate: date,
  lastDate: date,
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).nullable(), // not-policy: days of the week
  from: clock.nullable(),
  until: clock.nullable(),
  level,
  reason: z.string().trim().max(300).nullable(), // not-policy: as the table's CHECK
  reasonShared: z.boolean(),
}).strict()

export const unmarkedInput = z.object({ unmarkedMeans: z.enum(UNMARKED).nullable() }).strict()

export const daysQuery = z.object({ from: date, to: date })

export const strokeInput = z.object({
  date,
  from: clock.nullable(),
  until: clock.nullable(),
  level: z.enum([...LEVELS, 'clear']),
  target: z.enum(['days', 'pattern']),
}).strict()

export const requestInput = z.object({
  title: z.string().trim().min(1).max(80), // not-policy: as the table's CHECK
  message: z.string().trim().max(1000).nullable(), // not-policy: as the table's CHECK
  groupIds: z.array(z.string().max(200)).max(20), // not-policy: shape bound
  accountIds: z.array(z.string().max(40)).max(200), // not-policy: rule F1's ceiling
  from: date,
  to: date,
  dueOn: date,
}).strict()

export const withdrawInput = z.object({ accountId: z.string().min(1).max(40) }).strict() // not-policy: an id's length
