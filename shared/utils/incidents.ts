import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'

// The incident log's vocabulary (E-115, E-117). Nothing here reads a request or the database;
// `server/utils/incidents.ts` is where an entry is actually written and read.

export const CATEGORIES = ['MEDICAL', 'BEHAVIOUR', 'SAFETY', 'SECURITY', 'PROPERTY', 'OTHER'] as const
export type Category = (typeof CATEGORIES)[number]

// A near miss is one of these, never a second table: E-117 criterion 3's "distinct type" is this
// column (docs/data-model.md).
export const SEVERITIES = ['NOTE', 'NEAR_MISS', 'INCIDENT', 'SERIOUS'] as const
export type Severity = (typeof SEVERITIES)[number]

export function saysCategory(category: Category): string {
  if (category === 'MEDICAL') return 'Medical'
  if (category === 'BEHAVIOUR') return 'Behaviour'
  if (category === 'SAFETY') return 'Safety'
  if (category === 'SECURITY') return 'Security'
  if (category === 'PROPERTY') return 'Property'
  return 'Other'
}

export function saysSeverity(severity: Severity): string {
  if (severity === 'NOTE') return 'Note'
  if (severity === 'NEAR_MISS') return 'Near miss'
  if (severity === 'INCIDENT') return 'Incident'
  return 'Serious'
}

const BODY_LIMIT = 2000
const NEAR_MISS_LIMIT = 280

// Timestamp, category, severity and a free-text account (E-115 criterion 1). `happenedAt` is
// validated against tonight's own bounds at the write path, not here: this file reads no clock.
export const incidentForm = z.object({
  performanceId: z.string().min(1),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  body: z.string().trim().min(1).max(BODY_LIMIT),
  happenedAt: z.number().int().positive().nullish().transform(value => value ?? null),
})

export type IncidentInput = z.output<typeof incidentForm>

// A correction carries the same shape as the entry it corrects.
export const supersedeIncidentForm = incidentForm.omit({ performanceId: true })

// No severity triage, no further mandatory fields: one tap to pick a category and one sentence
// (E-117 criterion 1). `severity` is fixed to NEAR_MISS by the route, never asked for here.
export const nearMissForm = z.object({
  performanceId: z.string().min(1),
  category: z.enum(CATEGORIES),
  body: z.string().trim().min(1).max(NEAR_MISS_LIMIT),
})

export type NearMissInput = z.output<typeof nearMissForm>

// What a refused write reads as. SQLite names the columns for a unique index and the constraint
// name for a CHECK, so both spellings appear here (0047).
export const INCIDENT_CONSTRAINT_REFUSALS: { violated: string, says: string }[] = [
  {
    violated: 'incidents.supersedes_id',
    says: 'That entry already has a correction: file a new one superseding the correction instead',
  },
  {
    violated: 'incidents_no_self_supersede',
    says: 'An entry cannot correct itself',
  },
]

export function incidentConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(INCIDENT_CONSTRAINT_REFUSALS, error)
}
