// The shapes the programme routes accept, shared so a create and an edit agree on every bound.
import { z } from 'zod'
import { SLUG } from './service'

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
  ageGuidance: text(40), // not-policy: the table's bound on age guidance
  advisoriesConfirmedNone: z.boolean(),
  contentNote: text(4000), // not-policy: public text's bound
  runningMinutes: z.number().int().positive().max(24 * 60).nullable(), // not-policy: a day
  intervalCount: z.number().int().min(0).max(10), // not-policy: a sane ceiling on intervals
  externalBookingUrl: z.string().trim().url().startsWith('https://').max(2000).nullable(), // not-policy: an address's bound
  creditsPublic: z.boolean(),
  listed: z.boolean(),
})

export const productionInput = productionFields.partial().required({ title: true, kind: true })
export const productionPatch = productionFields.partial()

export const advisoriesInput = z.object({
  advisories: z.array(z.object({ termId: z.string().min(1), detail: text(300).default(null) })).max(50), // not-policy: the table's bound on a detail; a list's ceiling
})
