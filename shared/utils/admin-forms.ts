import { z } from 'zod'
import { MANUAL_ACTION_NAMES } from './audit-actions'
import { londonDay, londonDayField } from './membership'
import { ROLES } from './roles'
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

export const awardFellowship = z.object({
  userId: accountId,
  awardedOn: londonDayField,
  // The meeting, never an individual: the theatre awards this (0023).
  awardedBy: z.string().trim().min(1, 'Name the meeting that resolved it').max(200),
  citation: z.string().trim().min(1, 'The citation is the public wording').max(1000),
})

export const revokeFellowship = z.object({
  reason: z.string().trim().min(1, 'A revocation is recorded with its reason').max(500),
})

export const recordMembership = z.object({
  userId: accountId,
  startsOn: londonDayField,
  years: z.union([z.literal(1), z.literal(3)]),
  evidence: z.string().trim().max(200).optional(),
  studentId: z.string().trim().max(32).optional(),
})

// A role granted or revoked away from the screens names which role, or the entry says nothing.
export const MANUAL_ROLE_ACTIONS: readonly string[] = ['manual.role.granted', 'manual.role.revoked']
const isRole = (value: unknown): boolean => typeof value === 'string' && (ROLES as readonly string[]).includes(value)

export const recordManualEntry = z.object({
  action: z.enum(MANUAL_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]),
  target: accountId,
  onBehalfOf: accountId,
  occurredAt: z.number().int().positive(),
  detail: z.record(z.string().max(60), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
}).refine(input => !MANUAL_ROLE_ACTIONS.includes(input.action) || isRole(input.detail.role), {
  path: ['detail', 'role'], message: 'Say which role was granted or revoked',
})

// The form takes the day it happened; the endpoint takes the second that day began. Stated as its
// own object rather than derived, because a derived one types as loosely as its loosest part.
export const manualEntryForm = z.object({
  action: z.enum(MANUAL_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]),
  target: z.string('Choose who it was about').min(1, 'Choose who it was about').max(64),
  onBehalfOf: z.string('Choose who decided it').min(1, 'Choose who decided it').max(64),
  // Checked here as well as by the route, so a future date is refused before a second factor is asked.
  occurredOn: londonDayField.refine(day => day <= londonDay(new Date()), 'That date has not happened yet'),
  role: z.enum(ROLES, 'Choose which role').optional(),
}).refine(input => !MANUAL_ROLE_ACTIONS.includes(input.action) || input.role !== undefined, { path: ['role'], message: 'Choose which role' })

export type ManualEntryForm = z.output<typeof manualEntryForm>

// What a form holds while it is being filled in: the dates are still strings and the person may
// not have been chosen yet.
export type AwardFellowship = z.output<typeof awardFellowship>
export type RecordMembership = z.output<typeof recordMembership>
