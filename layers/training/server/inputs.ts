// What Training's routes accept. Limits are the schema's (part 2); a step kind is accepted here once
// the slice that delivers it is built.
import { z } from 'zod'
import { EVIDENCE_EXPIRY, EVIDENCE_FILE, NEEDED_FOR, REVOKE_CODES } from '../shared/states'

const DAY = /^\d{4}-\d{2}-\d{2}$/ // not-policy: the shape of a date
export const day = z.string().regex(DAY, 'Give the date as a day, month and year.')
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null)

export const courseInput = z.object({
  title: z.string().trim().min(1).max(120), // not-policy: the schema's limit (part 2)
  summary: optionalText(500), // not-policy: the schema's limit (part 2)
  categoryTermId: z.string().nullable().optional(),
  expires: z.boolean(),
  // Seconds. Defaults from training.records.default-valid-for when the course expires.
  validFor: z.number().int().positive().nullable().optional(),
  selfSignUp: z.boolean().optional(),
})
export type CourseInput = z.infer<typeof courseInput>
export const courseChange = courseInput.partial()
export type CourseChange = z.infer<typeof courseChange>

const common = {
  id: z.string().optional(),
  title: z.string().trim().min(1).max(120), // not-policy: the schema's limit (part 2)
  neededFor: z.enum(NEEDED_FOR).default('both'),
  guidance: optionalText(2000), // not-policy: the schema's limit (part 2)
  // The author says the step has changed, so sign-offs for the step it was copied from stop counting (V3).
  changed: z.boolean().optional(),
}
const material = {
  materialUrl: z.string().trim().url().max(500).nullable().optional().transform(v => v || null), // not-policy: the schema's limit (part 2)
  materialFileId: z.string().nullable().optional(),
}

export const stepInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), ...common, ...material }),
  z.object({ kind: z.literal('practical'), ...common, ...material, timesRequired: z.number().int().min(1).max(20).default(1) }), // not-policy: the schema's limit (part 2)
  z.object({ kind: z.literal('reading'), ...common, ...material }),
  z.object({ kind: z.literal('certificate'), ...common, evidenceExpiry: z.enum(EVIDENCE_EXPIRY), evidenceFile: z.enum(EVIDENCE_FILE) }),
])
export type StepInput = z.infer<typeof stepInput>
export const stepsInput = z.object({ steps: z.array(stepInput).min(1).max(20) }) // not-policy: the schema's limit (part 2)

export const publishInput = z.object({
  changeKind: z.enum(['records-stand', 'retraining-required']).optional(),
  changeNote: optionalText(500), // not-policy: the schema's limit (part 2)
})

export const signOffInput = z.object({
  accountId: z.string().min(1),
  stepId: z.string().min(1),
  occurredOn: day,
  note: optionalText(500), // not-policy: the schema's limit (part 2)
})

export const voidInput = z.object({ note: z.string().trim().min(1).max(500) }) // not-policy: the schema's limit (part 2)

export const directAwardInput = z.object({
  accountId: z.string().min(1),
  reason: z.string().trim().min(1).max(500), // not-policy: the schema's limit (part 2)
  // The last day it is valid, in the theatre's time zone; null only for a course that never lapses.
  expiresOn: day.nullable(),
})

export const revokeInput = z.object({
  code: z.enum(REVOKE_CODES),
  note: z.string().trim().min(1).max(500), // not-policy: the schema's limit (part 2)
})
