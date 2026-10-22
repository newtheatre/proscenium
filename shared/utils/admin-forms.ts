import { z } from 'zod'
import { MANUAL_ACTION_NAMES } from './audit-actions'
import { londonDay, londonDayField } from './membership'
import type { AuditActionName } from './audit-actions'

// One schema per admin form, validating the request and driving the form that sends it (0032).
// Two definitions drift; this one cannot.

const accountId = z.string().min(1, 'Say which account you mean').max(64)

// Money is typed in pounds and held in pence (0004, K-123 criterion 2). A figure read off a card
// reader carries a pound sign and a thousands comma; anything else is refused, never rounded.
const POUNDS = /^\u00a3?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?$/

export function penceFromPounds(raw: string): number | null {
  const match = POUNDS.exec(raw.trim())
  if (!match) return null
  return Number(match[1]!.replaceAll(',', '')) * 100 + Number(match[2] ?? 0)
}

// A typed price also takes one figure of pence, 1.5 being £1.50; "2,50" and 7.555 stay refused,
// never read as £250 or rounded to £7.55 (0127).
export function penceFromTyped(raw: string): number | null {
  const trimmed = raw.trim()
  return penceFromPounds(/\.\d$/.test(trimmed) ? `${trimmed}0` : trimmed)
}

// Digits only: a sign, a fraction or a separator is refused rather than clamped or rounded (0127).
export function wholeFromTyped(raw: string): number | null {
  const trimmed = raw.trim()
  return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : null
}

// Each field says what it wants, empty or not, rather than the house's last resort (0158).
export const awardFellowship = z.object({
  userId: z.string('Choose who is being honoured').min(1, 'Choose who is being honoured').max(64),
  awardedOn: londonDayField.refine(day => day <= londonDay(new Date()), 'Give the day it was resolved, today or earlier'),
  // The meeting, never an individual: the theatre awards this (0023).
  awardedBy: z.string('Name the meeting that resolved it').trim().min(1, 'Name the meeting that resolved it').max(200),
  citation: z.string('Write the citation, the public wording').trim().min(1, 'Write the citation, the public wording').max(1000),
})

export const revokeFellowship = z.object({
  reason: z.string().trim().min(1, 'A revocation is recorded with its reason').max(500),
})

export const recordMembership = z.object({
  userId: accountId,
  startsOn: londonDayField,
  years: z.union([z.literal(1), z.literal(3)]),
  evidence: z.string().trim().max(200).optional(),
  studentId: z.string().trim().max(32).optional()
    .refine(value => !value || /^\d{6,12}$/.test(value), 'A student number is the 6 to 12 digits on the student card'),
})

export const recordManualEntry = z.object({
  action: z.enum(MANUAL_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]),
  target: accountId,
  onBehalfOf: accountId,
  occurredAt: z.number().int().positive(),
  detail: z.record(z.string().max(60), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
})

// The form takes the day it happened; the endpoint takes the second that day began. Stated as its
// own object rather than derived, because a derived one types as loosely as its loosest part.
export const manualEntryForm = z.object({
  action: z.enum(MANUAL_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]),
  target: accountId,
  onBehalfOf: accountId,
  occurredOn: londonDayField,
})

export type ManualEntryForm = z.output<typeof manualEntryForm>

// What a form holds while it is being filled in: the dates are still strings and the person may
// not have been chosen yet.
export type AwardFellowship = z.output<typeof awardFellowship>
export type RecordMembership = z.output<typeof recordMembership>
