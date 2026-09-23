import { z } from 'zod'
import { SCOPES, bookingForm } from './bookings'
import { londonDay } from './membership'

// A booking outside policy, offered as a request rather than refused (C-108). The two ages are
// what stop one sitting forever, which is what the old app did with every request nobody saw.

export const REQUEST_REASON_LIMIT = 1000

export const requestForm = bookingForm.extend({
  // Somebody has to decide on this, and "please" is not a decision they can make.
  reason: z.string().trim().min(1, 'Say why this one is worth an exception').max(REQUEST_REASON_LIMIT),
})

export type RequestInput = z.output<typeof requestForm>

export function dueToEscalate(request: { createdAt: number, escalatedAt: number | null }, now: number, hours: number): boolean {
  if (request.escalatedAt !== null) return false
  return now - request.createdAt >= hours * 3600
}

export function dueToExpire(request: { createdAt: number }, now: number, hours: number): boolean {
  return now - request.createdAt >= hours * 3600
}

// An edit is a request re-asked, so it carries everything a request must, plus which of a series
// the member meant. No default scope: C-111 criterion 1 asks, never assumes.
export const editRequestForm = requestForm.extend({
  scope: z.enum(SCOPES).nullish().transform(value => value ?? null),
})

export type EditRequestInput = z.output<typeof editRequestForm>

interface Placed { roomId: string, startsAt: number, endsAt: number }

// A different room or a different London day is a new question for the approvers, so they get the
// full time to answer it; anything else is the same request tidied (issue 1055).
export function restartsTheClock(before: Placed, after: Placed): boolean {
  const day = (at: number): string => londonDay(new Date(at * 1000))
  return before.roomId !== after.roomId
    || day(before.startsAt) !== day(after.startsAt)
    || day(before.endsAt) !== day(after.endsAt)
}

export interface EditableRequest extends Placed {
  attendees: number | null
  tier: string
  purpose: string | null
  title: string
  notes: string | null
  reason: string | null
}

const FACTS = ['roomId', 'startsAt', 'endsAt', 'attendees', 'tier', 'purpose'] as const
const WORDS = ['title', 'notes', 'reason'] as const

// The audit detail for an edit: facts from and to, the member's own words only named (0011).
export function editDiff(before: EditableRequest, after: EditableRequest): {
  changed: Partial<Record<(typeof FACTS)[number], { from: unknown, to: unknown }>>
  rewritten: (typeof WORDS)[number][]
} {
  const changed: Partial<Record<(typeof FACTS)[number], { from: unknown, to: unknown }>> = {}
  for (const key of FACTS) {
    if (before[key] !== after[key]) changed[key] = { from: before[key], to: after[key] }
  }
  return { changed, rewritten: WORDS.filter(key => before[key] !== after[key]) }
}

// The cap counts every slot a member holds that has not ended, and the request being edited is one
// of them; judging it against itself would refuse an edit that adds nothing (C-106).
export function othersHeld(active: number, editing: { endsAt: number }, now: number): number {
  return editing.endsAt > now ? active - 1 : active
}
