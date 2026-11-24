// The shapes the routes accept (spec parts 2 and 3). Rules that need the database live in the services.
import { z } from 'zod'
import { LEVELS, TENTATIVE_AS, UNMARKED, VOTES } from '../shared/levels'

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

export const onBehalfInput = exceptionInput.extend({ accountId: z.string().min(1).max(40) }).strict() // not-policy: an id's length

export const personQuery = z.object({ accountId: z.string().min(1).max(40) }) // not-policy: an id's length

export const findInput = z.object({
  groupIds: z.array(z.string().max(200)).max(20), // not-policy: shape bound
  accountIds: z.array(z.string().max(40)).max(200), // not-policy: rule F1's ceiling
  must: z.array(z.string().max(40)).max(30), // not-policy: rule F1's ceiling on must-have people
  from: date,
  to: date,
  hoursFrom: clock,
  hoursTo: clock,
  length: z.number().int().min(1).max(1440), // not-policy: minutes in a day
  spaceIds: z.array(z.string().max(40)).max(30), // not-policy: occupancy's ceiling on spaces (O3)
  roomOptional: z.boolean(),
}).strict()

export const pollInput = z.object({
  title: z.string().trim().min(1).max(80), // not-policy: as the table's CHECK
  groupIds: z.array(z.string().max(200)).min(1).max(20), // not-policy: shape bound
  accountIds: z.array(z.string().max(40)).max(200), // not-policy: rule F1's ceiling
  must: z.array(z.string().max(40)).max(30), // not-policy: rule F1's ceiling on must-have people
  spaceIds: z.array(z.string().max(40)).max(30), // not-policy: occupancy's ceiling on spaces (O3)
  length: z.number().int().min(15).max(720), // not-policy: as the table's CHECK
  slots: z.array(z.object({ date, start: z.number().int().min(0).max(1439) }).strict()).min(2).max(6), // not-policy: rule F7's shortlist
  answersBy: date,
}).strict()

export const voteInput = z.object({
  answers: z.array(z.object({ slotId: z.string().min(1).max(40), answer: z.enum(VOTES) }).strict()).min(1).max(6), // not-policy: rule F7's shortlist
}).strict()

export const decideInput = z.object({ slotId: z.string().min(1).max(40) }).strict() // not-policy: an id's length

const meetingTime = {
  date,
  start: z.number().int().min(0).max(1439), // not-policy: minutes in a day
  end: z.number().int().min(1).max(1440), // not-policy: minutes in a day
  title: z.string().trim().min(1).max(80), // not-policy: as the table's CHECK
  place: z.string().trim().max(120).nullable(), // not-policy: as the table's CHECK
  notes: z.string().trim().max(2000).nullable(), // not-policy: as the table's CHECK
}

export const arrangeInput = z.object({
  ...meetingTime,
  groupIds: z.array(z.string().max(200)).max(20), // not-policy: shape bound
  accountIds: z.array(z.string().max(40)).max(200), // not-policy: rule F1's ceiling
  findId: z.string().min(1).max(40).nullable(), // not-policy: an id's length
}).strict()

export const changeInput = z.object({ ...meetingTime, tell: z.boolean() }).strict()

export const respondInput = z.object({ response: z.enum(['going', 'not-going']) }).strict()

export const cancelInput = z.object({ reason: z.string().trim().max(200).nullable() }).strict() // not-policy: as the table's CHECK

/** S14: a calendar address and what its tentative events become (I1, I3). */
const label = z.string().trim().min(1).max(40) // not-policy: as the table's CHECK
export const connectInput = z.object({ label, url: z.string().trim().min(1).max(2000), tentativeAs: z.enum(TENTATIVE_AS) }).strict() // not-policy: the address's limit in part 2
export const connectionInput = z.object({ label, tentativeAs: z.enum(TENTATIVE_AS) }).strict()
