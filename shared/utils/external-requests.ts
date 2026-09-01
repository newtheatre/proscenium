import { z } from 'zod'

// Asking the union for a room (C-120). The lifecycle has three decision points where booking one
// of our own rooms has one, which is why it is its own thing and not a booking with a new status.

export const EXTERNAL_STATUSES = ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const
export type ExternalStatus = (typeof EXTERNAL_STATUSES)[number]

export const EXTERNAL_REASON_LIMIT = 500

// Nothing here holds a slot, so nothing here is settled by time alone; only a person settles it.
export const OPEN_STATUSES: readonly ExternalStatus[] = ['REQUESTED', 'AWAITING_EXTERNAL']
export const SETTLED_STATUSES: readonly ExternalStatus[] = ['CONFIRMED', 'REJECTED', 'CANCELLED']

export type Verb = 'submit' | 'assign' | 'refuse-assignment' | 'reject' | 'cancel'

const ALLOWED: Record<Verb, readonly ExternalStatus[]> = {
  'submit': ['REQUESTED'],
  'assign': ['AWAITING_EXTERNAL'],
  'refuse-assignment': ['AWAITING_EXTERNAL'],
  'reject': ['REQUESTED', 'AWAITING_EXTERNAL'],
  // A confirmed request is still a member's to withdraw, and the union is told by a person.
  'cancel': ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED'],
}

export function saysExternalStatus(status: string): string {
  if (status === 'REQUESTED') return 'Waiting to go to the union'
  if (status === 'AWAITING_EXTERNAL') return 'With the union'
  if (status === 'CONFIRMED') return 'Confirmed'
  if (status === 'REJECTED') return 'Turned down'
  if (status === 'CANCELLED') return 'Cancelled'
  return status
}

// One phrase or null, so a route and a screen refuse for the same reason in the same words.
export function refusalToAct(request: { status: string }, verb: Verb): string | null {
  if (ALLOWED[verb].includes(request.status as ExternalStatus)) return null
  return `That request is ${saysExternalStatus(request.status).toLowerCase()}, so it cannot be ${past(verb)}`
}

function past(verb: Verb): string {
  if (verb === 'submit') return 'sent to the union'
  if (verb === 'assign') return 'given a room'
  if (verb === 'refuse-assignment') return 'sent back to the union'
  if (verb === 'reject') return 'turned down'
  return 'cancelled'
}

export const EXTERNAL_REFUSALS = ['NO_MEMBERSHIP', 'IN_THE_PAST', 'SHORT_NOTICE', 'BEYOND_HORIZON'] as const
export type ExternalRefusal = (typeof EXTERNAL_REFUSALS)[number]

export interface ExternalFailure { reason: ExternalRefusal, says: string }

export interface ExternalContext {
  now: Date
  hasMembership: boolean
  noticeDays: number
  horizonWeeks: number
}

// Judged separately from a room of ours: opening hours, capacity and an active flag are things the
// union never tells us, so asking about them would be inventing an answer.
export function judgeExternal(span: { startsAt: Date, endsAt: Date }, context: ExternalContext): ExternalFailure[] {
  const failures: ExternalFailure[] = []

  if (!context.hasMembership) {
    failures.push({ reason: 'NO_MEMBERSHIP', says: 'Asking for a room needs a current membership.' })
  }
  if (span.endsAt.getTime() <= context.now.getTime()) {
    failures.push({ reason: 'IN_THE_PAST', says: 'That slot has already happened.' })
  }

  const days = (span.startsAt.getTime() - context.now.getTime()) / 86_400_000
  if (days < context.noticeDays) {
    failures.push({
      reason: 'SHORT_NOTICE',
      says: `The union needs ${context.noticeDays} days, because a person fills in their form and waits for an answer.`,
    })
  }
  if (days / 7 > context.horizonWeeks) {
    failures.push({ reason: 'BEYOND_HORIZON', says: `Rooms are asked for up to ${context.horizonWeeks} weeks ahead.` })
  }

  return failures
}

const instant = z.string().datetime()

export const externalRequestForm = z.object({
  title: z.string().trim().min(1, 'Say what the room is for').max(200),
  purpose: z.string().trim().min(1, 'Say what the room is for').max(32),
  attendees: z.number().int().positive().nullish().transform(value => value ?? null),
  startsAt: instant,
  endsAt: instant,
  // A preference, never a promise: the union may give us anything (C-120).
  preferredSpaceId: z.string().min(1).max(64).nullish().transform(value => value ?? null),
  notes: z.string().trim().max(1000).nullish().transform(value => (value ?? '').trim() || null),
}).refine(request => new Date(request.endsAt) > new Date(request.startsAt), {
  path: ['endsAt'],
  message: 'A booking ends after it starts',
})

export const submitForm = z.object({
  suReference: z.string().trim().max(120).nullish().transform(value => (value ?? '').trim() || null),
})

export const assignForm = z.object({
  spaceId: z.string().min(1).max(64),
  suReference: z.string().trim().max(120).nullish().transform(value => (value ?? '').trim() || null),
  // Asserted past a room we have marked unsuitable, never defaulted: the whole complaint is that
  // nobody knew until they turned up to it.
  despite: z.boolean().default(false),
})

export const refuseAssignmentForm = z.object({
  spaceId: z.string().min(1).max(64),
  reason: z.string().trim().min(1, 'Say what was wrong with it').max(EXTERNAL_REASON_LIMIT),
  // Written in the same action, so the blacklist builds itself rather than being a separate chore.
  note: z.object({
    verdict: z.enum(['CAUTION', 'UNSUITABLE']),
    reason: z.string().trim().min(1).max(EXTERNAL_REASON_LIMIT),
  }).nullish().transform(value => value ?? null),
})

export const rejectExternalForm = z.object({
  reason: z.string().trim().min(1, 'Say why, because the member is shown it').max(EXTERNAL_REASON_LIMIT),
})
