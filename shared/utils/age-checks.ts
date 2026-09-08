import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'

// The Challenge 25 register's vocabulary (E-118). Nothing here reads a request or the database;
// `server/utils/age-checks.ts` is where an entry is actually written and read.

export const AGE_CHECK_OUTCOMES = ['ACCEPTED', 'REFUSED'] as const
export type AgeCheckOutcome = (typeof AGE_CHECK_OUTCOMES)[number]

export const ID_TYPES = ['PASSPORT', 'DRIVING_LICENCE', 'PASS_CARD', 'OTHER'] as const
export type IdType = (typeof ID_TYPES)[number]

export const REFUSAL_REASONS = ['NO_ID_SHOWN', 'ID_LOOKED_FALSE', 'APPEARED_UNDERAGE', 'OTHER'] as const
export type RefusalReason = (typeof REFUSAL_REASONS)[number]

export function saysOutcome(outcome: AgeCheckOutcome): string {
  return outcome === 'ACCEPTED' ? 'ID accepted' : 'Refused'
}

export function saysIdType(idType: IdType): string {
  if (idType === 'PASSPORT') return 'Passport'
  if (idType === 'DRIVING_LICENCE') return 'Photocard driving licence'
  if (idType === 'PASS_CARD') return 'PASS card'
  return 'Other'
}

export function saysRefusalReason(reason: RefusalReason): string {
  if (reason === 'NO_ID_SHOWN') return 'No ID shown'
  if (reason === 'ID_LOOKED_FALSE') return 'ID looked false'
  if (reason === 'APPEARED_UNDERAGE') return 'Appeared underage even with ID'
  return 'Other'
}

const DESCRIPTION_LIMIT = 200
const NOTES_LIMIT = 1000

// The description is guidance, not enforcement: nothing here can tell a name from a description,
// so the form's own copy is what keeps one out (E-118 criterion 2).
const outcomeFields = {
  outcome: z.enum(AGE_CHECK_OUTCOMES),
  idType: z.enum(ID_TYPES).nullish().transform(value => value ?? null),
  reason: z.enum(REFUSAL_REASONS).nullish().transform(value => value ?? null),
  description: z.string().trim().min(1, 'Describe who you checked, never by name').max(DESCRIPTION_LIMIT),
  notes: z.string().trim().max(NOTES_LIMIT).nullish().transform(value => (value ?? '').trim() || null),
}

// Shared between a standalone check and one folded into a sale (F-106): what an outcome requires
// is the same wherever it is asked, so the predicate is written once and wired to both shapes.
interface OutcomeShape { outcome: AgeCheckOutcome, idType: IdType | null, reason: RefusalReason | null }
const acceptedNeedsIdType = (input: OutcomeShape): boolean => input.outcome !== 'ACCEPTED' || input.idType !== null
const refusedNeedsReason = (input: OutcomeShape): boolean => input.outcome !== 'REFUSED' || input.reason !== null
const acceptedHasNoReason = (input: OutcomeShape): boolean => input.outcome !== 'ACCEPTED' || input.reason === null
const refusedHasNoIdType = (input: OutcomeShape): boolean => input.outcome !== 'REFUSED' || input.idType === null

export const ageCheckForm = z.object({
  performanceId: z.string().min(1).nullish().transform(value => value ?? null),
  ...outcomeFields,
  product: z.string().trim().max(200).nullish().transform(value => (value ?? '').trim() || null),
}).refine(acceptedNeedsIdType, { path: ['idType'], message: 'Say what ID was shown' })
  .refine(refusedNeedsReason, { path: ['reason'], message: 'Say why, because a refusal needs a reason on the record' })
  .refine(acceptedHasNoReason, { path: ['reason'], message: 'An accepted check has no refusal reason' })
  .refine(refusedHasNoIdType, { path: ['idType'], message: 'A refusal names no ID: nothing was accepted' })

export type AgeCheckInput = z.output<typeof ageCheckForm>

// Folded into a till sale (F-106): the performance is the till's own to resolve, and the product
// is the basket's restricted lines, not a second thing for staff to type.
export const inlineAgeCheckForm = z.object(outcomeFields)
  .refine(acceptedNeedsIdType, { path: ['idType'], message: 'Say what ID was shown' })
  .refine(refusedNeedsReason, { path: ['reason'], message: 'Say why, because a refusal needs a reason on the record' })
  .refine(acceptedHasNoReason, { path: ['reason'], message: 'An accepted check has no refusal reason' })
  .refine(refusedHasNoIdType, { path: ['idType'], message: 'A refusal names no ID: nothing was accepted' })

export type InlineAgeCheckInput = z.output<typeof inlineAgeCheckForm>

export const supersedeForm = z.object({
  outcome: z.enum(AGE_CHECK_OUTCOMES),
  idType: z.enum(ID_TYPES).nullish().transform(value => value ?? null),
  reason: z.enum(REFUSAL_REASONS).nullish().transform(value => value ?? null),
  description: z.string().trim().min(1, 'Describe who you checked, never by name').max(DESCRIPTION_LIMIT),
  product: z.string().trim().max(200).nullish().transform(value => (value ?? '').trim() || null),
  notes: z.string().trim().max(NOTES_LIMIT).nullish().transform(value => (value ?? '').trim() || null),
}).refine(
  input => input.outcome !== 'ACCEPTED' || input.idType !== null,
  { path: ['idType'], message: 'Say what ID was shown' },
).refine(
  input => input.outcome !== 'REFUSED' || input.reason !== null,
  { path: ['reason'], message: 'Say why, because a refusal needs a reason on the record' },
)

// What a refused write reads as. SQLite names the columns for a unique index and the constraint
// name for a CHECK, so both spellings appear here (0047).
export const AGE_CHECK_CONSTRAINT_REFUSALS: { violated: string, says: string }[] = [
  {
    violated: 'age_checks.supersedes_id',
    says: 'That entry already has a correction: file a new one superseding the correction instead',
  },
  {
    violated: 'age_checks_outcome_shape',
    says: 'An accepted check names the ID and nothing else; a refusal names why and nothing else',
  },
  {
    violated: 'age_checks_no_self_supersede',
    says: 'An entry cannot correct itself',
  },
]

export function ageCheckConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(AGE_CHECK_CONSTRAINT_REFUSALS, error)
}
