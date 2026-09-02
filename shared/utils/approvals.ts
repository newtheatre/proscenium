import { z } from 'zod'
import type { BookingStatus } from './bookings'

// Deciding on a request (C-109). What a decision may do, and what nobody may undo: the pure half,
// so the queue screen and the route read the same rules.

// D1 caps a statement at 100 bound parameters, so a read covering a batch is split (0003).
export const BOUND_PARAMETER_CHUNK = 90

// One triage sitting, not a whole term's backlog (criterion 4).
export const BULK_LIMIT = 100

export function chunked<T>(items: readonly T[], size = BOUND_PARAMETER_CHUNK): T[][] {
  const batches: T[][] = []
  for (let at = 0; at < items.length; at += size) batches.push(items.slice(at, at + size))
  return batches
}

export const DECISIONS = ['APPROVE', 'REJECT'] as const
export type Decision = (typeof DECISIONS)[number]

// Terminal for everyone, officers included: the slot may be somebody else's by now, so reopening
// is refused rather than racing whoever holds it (criterion 5).
export const SETTLED: readonly BookingStatus[] = ['REJECTED', 'CANCELLED', 'BUMPED']

export const REJECTION_REASON_LIMIT = 1000

export function saysStatus(status: string): string {
  return status.toLowerCase().replace('_', ' ')
}

// One refusal per reason, phrased for the officer rather than the requester.
export function refusalToDecide(booking: { status: string }): string | null {
  if (booking.status === 'PENDING_APPROVAL') return null
  if (SETTLED.includes(booking.status as BookingStatus)) {
    return `That request was already ${saysStatus(booking.status)}`
  }
  return 'That booking is not waiting for a decision'
}

export const decisionForm = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_LIMIT),
  action: z.enum(DECISIONS),
  reason: z.string().trim().max(REJECTION_REASON_LIMIT).nullish().transform(value => (value ?? '').trim() || null),
  // Approve into a room other than the one asked for (criterion 1).
  roomId: z.string().min(1).max(64).nullish().transform(value => value ?? null),
})
  .refine(input => input.action !== 'REJECT' || input.reason !== null, {
    path: ['reason'],
    message: 'Say why, because the requester is shown it word for word',
  })
  .refine(input => input.roomId === null || input.action === 'APPROVE', {
    path: ['roomId'],
    message: 'A rejection does not move a request to another room',
  })
  // A different room is a different decision for each request, so it is one at a time.
  .refine(input => input.roomId === null || input.ids.length === 1, {
    path: ['roomId'],
    message: 'Moving a request to another room is one at a time',
  })

export type DecisionInput = z.output<typeof decisionForm>

// Moving a request between a room we manage and one we do not (C-123). The reason is shown to the
// member, so it is required in both directions: a room changing under them needs an explanation.
export const unlistForm = z.object({
  reason: z.string().trim().min(1, 'Say why, because the member is shown it').max(REJECTION_REASON_LIMIT),
})

export const relistForm = z.object({
  roomId: z.string().min(1).max(64),
  reason: z.string().trim().min(1, 'Say why, because the member is shown it').max(REJECTION_REASON_LIMIT),
})
