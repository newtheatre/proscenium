import { londonParts } from './london'
import { coversThrough, lastCovered, workingDaysBetween } from './working-days'
import { z } from 'zod'

// Asking for a room we do not manage (C-120). The lifecycle has three decision points where
// booking one of ours has one, so it is its own thing rather than a booking with a new status.

export const EXTERNAL_STATUSES = ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const
export type ExternalStatus = (typeof EXTERNAL_STATUSES)[number]

export const EXTERNAL_REASON_LIMIT = 500

// Nothing here holds a slot, so nothing here is settled by time alone; only a person settles it.
export const OPEN_STATUSES: readonly ExternalStatus[] = ['REQUESTED', 'AWAITING_EXTERNAL']

export type Verb = 'submit' | 'assign' | 'refuse-assignment' | 'reject' | 'cancel'

const ALLOWED: Record<Verb, readonly ExternalStatus[]> = {
  'submit': ['REQUESTED'],
  // Also from CONFIRMED: being moved room to room after an answer is ordinary, and without this
  // the room we were given can never be corrected (C-120).
  'assign': ['AWAITING_EXTERNAL', 'CONFIRMED'],
  'refuse-assignment': ['AWAITING_EXTERNAL', 'CONFIRMED'],
  'reject': ['REQUESTED', 'AWAITING_EXTERNAL'],
  // A confirmed request is still a member's to withdraw, and their side is told by a person.
  'cancel': ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED'],
}

export function saysExternalStatus(status: string): string {
  if (status === 'REQUESTED') return 'Not yet requested'
  if (status === 'AWAITING_EXTERNAL') return 'Requested, awaiting a room'
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
  if (verb === 'submit') return 'requested'
  if (verb === 'assign') return 'given a room'
  if (verb === 'refuse-assignment') return 'sent back'
  if (verb === 'reject') return 'turned down'
  return 'cancelled'
}

export const EXTERNAL_REFUSALS = ['NO_MEMBERSHIP', 'IN_THE_PAST', 'SHORT_NOTICE', 'BEYOND_HORIZON', 'HOLIDAYS_UNKNOWN'] as const
export type ExternalRefusal = (typeof EXTERNAL_REFUSALS)[number]

export interface ExternalFailure { reason: ExternalRefusal, says: string }

export interface ExternalContext {
  now: Date
  hasMembership: boolean
  noticeWorkingDays: number
  horizonWeeks: number
  holidays: readonly string[]
}

// Judged separately from a room of ours: opening hours, capacity and an active flag are things
// nobody tells us about a room we do not manage, so asking would be inventing an answer.
export function judgeExternal(span: { startsAt: Date, endsAt: Date }, context: ExternalContext): ExternalFailure[] {
  const failures: ExternalFailure[] = []

  if (!context.hasMembership) {
    failures.push({ reason: 'NO_MEMBERSHIP', says: 'Asking for a room needs a current membership.' })
  }
  if (span.endsAt.getTime() <= context.now.getTime()) {
    failures.push({ reason: 'IN_THE_PAST', says: 'That slot has already happened.' })
  }

  // Notice is working days; the horizon is calendar weeks. Two different questions, and counting
  // the horizon in working days would quietly stretch it by two days a week.
  if (!coversThrough(context.holidays, span.startsAt)) {
    const reach = lastCovered(context.holidays)
    failures.push({
      reason: 'HOLIDAYS_UNKNOWN',
      says: reach
        ? `We cannot count the notice for that date: bank holidays are only known up to ${reach}.`
        : 'We cannot count the notice for that date: no bank holidays are recorded.',
    })
  }
  else if (workingDaysBetween(context.now, span.startsAt, context.holidays) < context.noticeWorkingDays) {
    failures.push({
      reason: 'SHORT_NOTICE',
      says: `This needs ${context.noticeWorkingDays} working days, because a person fills in a form and waits for an answer. Weekends and bank holidays do not count.`,
    })
  }

  const days = londonDaysBetween(context.now, span.startsAt)
  if (days / 7 > context.horizonWeeks) {
    failures.push({ reason: 'BEYOND_HORIZON', says: `Rooms are asked for up to ${context.horizonWeeks} weeks ahead.` })
  }

  return failures
}

// Whole London days apart, counted from midnight to midnight, so a clock change between them
// does not move the answer by an hour (0014).
function londonDaysBetween(from: Date, to: Date): number {
  const midnight = (at: Date): number => {
    const parts = londonParts(at)
    return Date.UTC(parts.year, parts.month - 1, parts.day)
  }
  return (midnight(to) - midnight(from)) / 86_400_000
}

const instant = z.string().datetime()

export const externalRequestForm = z.object({
  title: z.string().trim().min(1, 'Say what the room is for').max(200),
  purpose: z.string().trim().min(1, 'Say what the room is for').max(32),
  attendees: z.number().int().positive().nullish().transform(value => value ?? null),
  startsAt: instant,
  endsAt: instant,
  // A preference, never a promise: we may be given anything (C-120).
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
