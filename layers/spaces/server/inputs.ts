// Route input shared by more than one route. Bounds are shapes, as the tables' CHECKs.
import { z } from 'zod'
import { CONTROLS, FREQUENCIES, OPEN_TO } from '../shared/states'
import { COLOURS } from '../shared/setup'

const note = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)
const requirements = z.array(z.string().min(3).max(200)).max(10) // not-policy: shape bound
const minutes = z.number().int().min(1).max(1440).nullable() // not-policy: shape bound, a day at most

export const bookableDetails = z.object({
  name: z.string().trim().min(1).max(80).optional(), // not-policy: shape bound, as the table's CHECK
  homeVenueId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  control: z.enum(CONTROLS).optional(),
  approval: z.enum(['by-purpose', 'always']),
  approvalNote: note(500), // not-policy: as the table's CHECK
  externalContact: note(200), // not-policy: as the table's CHECK
  guidance: note(1000), // not-policy: shape bound
  colour: z.enum(COLOURS).nullable(),
  maxLengthMinutes: minutes,
  requirements,
}).strict()
export type BookableDetails = z.infer<typeof bookableDetails>

export const newBookable = z.union([
  z.object({ spaceId: z.string().min(1).max(40), externalContact: note(200), approvalNote: note(500) }).strict(), // not-policy: shape bound
  z.object({ name: z.string().trim().min(1).max(80), homeVenueId: z.string().min(1).max(40).nullish(), control: z.enum(CONTROLS), externalContact: note(200), approvalNote: note(500) }).strict(), // not-policy: shape bound
])
export type NewBookable = z.infer<typeof newBookable>

const clock = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/) // not-policy: the shape of HH:MM
export const hoursInput = z.object({
  alwaysOpen: z.boolean(),
  hours: z.array(z.object({ weekday: z.number().int().min(1).max(7), opensAt: clock, closesAt: clock }).strict()).max(28), // not-policy: four spans a day
}).strict()
export type HoursInput = z.infer<typeof hoursInput>

export const bookablePurposesInput = z.object({
  purposes: z.array(z.object({ purposeId: z.string().min(1).max(40), allowed: z.boolean(), approval: z.enum(['automatic', 'approval']).nullable() }).strict()).max(200), // not-policy: shape bound
}).strict()

export const purposeInput = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: as the table's CHECK
  description: note(300), // not-policy: as the table's CHECK
  tier: z.number().int().min(1).max(9), // not-policy: as the table's CHECK
  openTo: z.enum(OPEN_TO),
  needsProduction: z.boolean(),
  approval: z.enum(['automatic', 'approval']),
  maxLengthMinutes: minutes,
  maxAheadDays: z.number().int().min(1).max(730).nullable(), // not-policy: as the setting's range
  minNoticeMinutes: z.number().int().min(0).max(20160).nullable(), // not-policy: fourteen days, as the setting's range
  mayRepeat: z.boolean(),
  canBeBumped: z.boolean(),
  requirements,
}).strict()
export type PurposeInput = z.infer<typeof purposeInput>

const when = z.number().int().min(0)
export const askInput = z.object({
  bookableId: z.string().min(1).max(40), // not-policy: shape bound
  purposeId: z.string().min(1).max(40), // not-policy: shape bound
  startsAt: when,
  endsAt: when,
  productionId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  bookedFor: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  overrideReason: note(300), // not-policy: shape bound
}).strict()

export const detailsInput = z.object({
  title: z.string().trim().min(3).max(120), // not-policy: as the table's CHECK
  notes: note(1000), // not-policy: as the table's CHECK
  attendees: z.number().int().min(1).max(10000).nullable(), // not-policy: shape bound
}).strict()

export const requestInput = askInput.extend(detailsInput.shape).strict()

// The form sends what it has so far; only the time, place and purpose are checked.
export const checkInput = askInput.extend({ title: z.string().max(120).optional(), notes: z.string().max(1000).nullish(), attendees: z.number().int().nullish(), replaces: z.string().min(1).max(40).nullish() }).strict() // not-policy: shape bound

// X2 and X3: a booking to another time or room; the purpose, production and details stay.
export const moveInput = z.object({ bookableId: askInput.shape.bookableId, startsAt: when, endsAt: when, overrideReason: note(300) }).strict() // not-policy: shape bound

// X6: the no-show mark on a completed booking.
export const noShowInput = z.object({ noShow: z.boolean() }).strict()

const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: a date's shape

// A series (part 3, rules R1 to R8): the request's details with when it repeats instead of one time.
export const seriesInput = askInput.omit({ startsAt: true, endsAt: true }).extend({
  frequency: z.enum(FREQUENCIES),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).nullish(), // not-policy: days of a week
  startsLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), // not-policy: a clock time's shape
  lengthMinutes: z.number().int().min(1).max(1440), // not-policy: shape bound, a day
  firstDate: localDay,
  lastDate: localDay,
  leaveOut: z.array(localDay).max(104).default([]), // not-policy: as the setting's ceiling
}).extend(detailsInput.shape).strict()
export type SeriesInput = z.infer<typeof seriesInput>

export const seriesCheckInput = seriesInput.extend({ title: z.string().max(120).optional(), notes: z.string().max(1000).nullish(), attendees: z.number().int().nullish() }).strict() // not-policy: shape bound
