// The shapes the programme routes accept, shared so a create and an edit agree on every bound.
import { z } from 'zod'
import { LATECOMER_RULES } from '../../shared/latecomers'

// Nothing here imports server code, so a screen can check a form with the same schema its route uses.
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/ // not-policy: a slug's pattern

const text = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable()
const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape

export const seasonInput = z.object({
  name: z.string().trim().min(1).max(120), // not-policy: a season name's bounds
  startsOn: z.string().regex(DATE),
  endsOn: z.string().regex(DATE),
  summary: text(4000).optional(), // not-policy: public text's bound
})
export const seasonPatch = seasonInput.partial()

const productionFields = z.object({
  title: z.string().trim().min(1).max(200), // not-policy: the table's bound on a title
  kind: z.enum(['own', 'visiting', 'hire', 'event']),
  slug: z.string().min(1).max(60).regex(SLUG), // not-policy: a slug's length
  subtitle: text(200), // not-policy: a subtitle's bound
  summary: text(300), // not-policy: the table's bound on a summary
  description: text(20000), // not-policy: long public text's bound
  categoryTermId: z.string().min(1).nullable(),
  seasonId: z.string().min(1).nullable(),
  companyName: text(200), // not-policy: a company name's bound
  ageMin: z.number().int().min(0).max(21).nullable(), // not-policy: the table's bounds on a minimum age
  ageRestricted: z.boolean(),
  effectsConfirmedNone: z.boolean(),
  advisoriesConfirmedNone: z.boolean(),
  contentNote: text(4000), // not-policy: public text's bound
  runningMinutes: z.number().int().positive().max(24 * 60).nullable(), // not-policy: a day
  intervalCount: z.number().int().min(0).max(10), // not-policy: a sane ceiling on intervals
  intervalMinutes: z.number().int().min(0).max(120).nullable(), // not-policy: a sane ceiling on one interval
  doorsBeforeMinutes: z.number().int().min(0).max(180).nullable(), // not-policy: the doors setting's ceiling
  capacity: z.number().int().min(1).max(100_000).nullable(), // not-policy: a sane ceiling on a house
  usualSpaceId: z.string().min(1).nullable(),
  externalBookingUrl: z.string().trim().url().startsWith('https://').max(2000).nullable(), // not-policy: an address's bound
  // Null takes the theatre's usual practice.
  latecomers: z.enum(LATECOMER_RULES).nullable(),
  creditsPublic: z.boolean(),
  listed: z.boolean(),
})

export const productionInput = productionFields.partial().required({ title: true, kind: true })
export const productionPatch = productionFields.partial()

export const advisoriesInput = z.object({
  advisories: z.array(z.object({ termId: z.string().min(1), level: z.enum(['mentioned', 'discussed', 'depicted']), detail: text(300).default(null) })).max(100), // not-policy: the table's bound on a detail; a list's ceiling
})

export const effectsInput = z.object({
  effects: z.array(z.object({ termId: z.string().min(1), detail: text(300).default(null) })).max(50), // not-policy: the table's bound on a detail; a list's ceiling
})

// A time is UTC milliseconds, or a local date and time in the theatre's time zone, as the console's
// date-time fields give it.
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ // not-policy: a local date and time's shape
const instant = z.union([z.number().int().positive(), z.string().regex(LOCAL)])

const performanceFields = z.object({
  shape: z.enum(['timed', 'drop-in']),
  venueId: z.string().min(1),
  spaceId: z.string().min(1),
  startsAt: instant,
  endsAt: instant,
  doorsAt: instant.nullable(),
  intervalCount: z.number().int().min(0).max(10).nullable(), // not-policy: a sane ceiling on intervals
  intervalMinutes: z.number().int().min(0).max(120).nullable(), // not-policy: a sane ceiling on one interval
  capacity: z.number().int().min(0).max(100_000).nullable(), // not-policy: a sane ceiling on a house
  label: text(40), // not-policy: the table's bound on a label
  externalBookingUrl: z.string().trim().url().startsWith('https://').max(2000).nullable(), // not-policy: an address's bound
  runningMinutes: z.number().int().min(1).max(1440).nullable(), // not-policy: at most a day long
  doorsBeforeMinutes: z.number().int().min(0).max(180).nullable(), // not-policy: the doors setting's ceiling
})

export const performanceInput = performanceFields.partial().required({ venueId: true, spaceId: true, startsAt: true })
export const performancePatch = performanceFields.partial()

export const accessInput = z.object({
  features: z.array(z.object({ termId: z.string().min(1), detail: text(200).default(null) })).max(20), // not-policy: the table's bound on a detail; a list's ceiling
})

export const effectExceptionsInput = z.object({
  termIds: z.array(z.string().min(1)).max(20), // not-policy: a list's ceiling
})

export const cancelInput = z.object({
  reasonTermId: z.string().min(1),
  note: text(200).optional(), // not-policy: the table's bound on a note
})

export const impactQuery = z.object({
  kind: z.enum(['cancel', 'reschedule', 'move', 'capacity']),
})

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/ // not-policy: a time's shape

/** One start time's days: ISO weekdays (1 is Monday) and local times, HH:mm. */
export const runSlot = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7), // not-policy: ISO weekdays
  times: z.array(z.string().regex(TIME)).min(1).max(6), // not-policy: a sane ceiling on times a day
})
export const runSlots = z.array(runSlot).min(1).max(12) // not-policy: a sane ceiling on start times in a week

// A pattern gives its start times as slots, or (as before slots) one list of days and of times.
export const runPattern = z.object({
  venueId: z.string().min(1),
  spaceId: z.string().min(1),
  from: z.string().regex(DATE_ONLY),
  to: z.string().regex(DATE_ONLY),
  slots: runSlots.optional(),
  days: runSlot.shape.days.optional(),
  times: runSlot.shape.times.optional(),
  minutes: z.number().int().min(1).max(1440).nullable().optional(), // not-policy: at most a day long
  doorsBeforeMinutes: z.number().int().min(0).max(180).nullable().optional(), // not-policy: the doors setting's ceiling
}).refine(p => p.slots || (p.days && p.times), { message: 'Give the start times and their days.', path: ['slots'] })

export const runPresetInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's bound on a name
  slots: runSlots,
})

/** What a run was made from, kept with it so it can be edited (the space is the run's own). */
export const storedPattern = z.object({
  from: z.string().regex(DATE_ONLY),
  to: z.string().regex(DATE_ONLY),
  slots: runSlots,
  minutes: z.number().int().min(1).max(1440).nullable().optional(), // not-policy: at most a day long
  doorsBeforeMinutes: z.number().int().min(0).max(180).nullable().optional(), // not-policy: the doors setting's ceiling
})

/** A run's new pattern, and how many changes the person saw, so a stale preview is refused. */
export const runEditInput = z.object({
  venueId: z.string().min(1),
  spaceId: z.string().min(1),
  pattern: storedPattern,
  seen: z.object({ add: z.number().int().min(0), move: z.number().int().min(0), remove: z.number().int().min(0) }),
})

const reverseTimes = z.object({ startsAt: z.number().int().positive(), endsAt: z.number().int().positive(), doorsAt: z.number().int().positive().nullable() })
/** What an edit of a run changed, as the edit answered it, to put back. */
export const runEditUndoInput = z.object({
  added: z.array(z.string().min(1)).max(5000), // not-policy: a run's own ceiling
  moved: z.array(reverseTimes.extend({ id: z.string().min(1), venueId: z.string().min(1), spaceId: z.string().min(1) })).max(5000), // not-policy: a run's own ceiling
  cancelled: z.array(z.string().min(1)).max(5000), // not-policy: a run's own ceiling
  deleted: z.array(reverseTimes).max(5000), // not-policy: a run's own ceiling
  venueId: z.string().min(1),
  spaceId: z.string().min(1),
  pattern: storedPattern,
})

export const runInput = z.object({
  /** The pattern the person planned, kept with the run so it can be edited later. */
  pattern: storedPattern.optional(),
  venueId: z.string().min(1),
  spaceId: z.string().min(1),
  scheduled: z.boolean().default(true),
  capacity: z.number().int().min(0).max(100_000).nullable().optional(), // not-policy: a sane ceiling on a house
  intervalCount: z.number().int().min(0).max(10).nullable().optional(), // not-policy: a sane ceiling on intervals
  intervalMinutes: z.number().int().min(0).max(120).nullable().optional(), // not-policy: a sane ceiling on one interval
  externalBookingUrl: z.string().trim().url().startsWith('https://').max(2000).nullable().optional(), // not-policy: an address's bound
  label: text(40).optional(), // not-policy: the table's bound on a label
  performances: z.array(z.object({
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    doorsAt: z.number().int().positive().nullable(),
  })).min(1).max(5000), // not-policy: a sane ceiling on one run, about two years of daily shows
})

// Credits (C-09). A credit's printed name and role are each 1 to 120 characters, as the table says.
const VISIBILITY = z.enum(['public', 'members', 'hidden'])
const creditFields = z.object({
  creditedName: z.string().trim().min(1).max(120), // not-policy: the table's bound on a printed name
  role: z.string().trim().min(1).max(120), // not-policy: the table's bound on a role
  sectionTermId: z.string().min(1),
  accountId: z.string().min(1).nullable(),
  visibility: VISIBILITY,
})
export const creditInput = creditFields.partial({ accountId: true, visibility: true }).extend({
  performanceId: z.string().min(1).nullish(),
  lineUpId: z.string().min(1).nullish(),
})
export const creditPatch = creditFields.partial()
export const creditOrderInput = z.object({
  sectionTermId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500), // not-policy: a section's ceiling
  performanceId: z.string().min(1).nullish(),
})

const lineUpFields = {
  name: z.string().trim().min(1).max(120), // not-policy: the column's bound
  note: z.string().trim().max(200).nullish(), // not-policy: the column's bound
  startsAt: instant.nullish(),
  minutes: z.number().int().min(1).max(600).nullish(), // not-policy: the column's bound
  announced: z.boolean().optional(),
}
export const lineUpInput = z.object({ ...lineUpFields, name: lineUpFields.name.optional(), productionId: z.string().min(1).nullish(), after: z.string().min(1).nullish() })
  .refine(v => v.name || v.productionId, { path: ['name'], message: 'Give a name.' })
export const lineUpPatch = z.object(lineUpFields).partial()
export const lineUpMove = z.object({ after: z.string().min(1).nullable() })
export const ownCreditInput = z.object({ visibility: VISIBILITY })
