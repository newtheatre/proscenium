import { z } from 'zod'

// A room booking, and the two rules that decide whether one may exist: half-open intervals, and
// what a member is allowed to learn about a slot somebody else holds (C-107, C-103).

export const BOOKING_STATUSES = ['CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED'] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

// A decision in progress holds its slot, or an instant booking could take it from under one
// (C-103 criterion 2, C-108 criterion 2).
export const HOLDS_A_SLOT: readonly BookingStatus[] = ['CONFIRMED', 'PENDING_APPROVAL']

// No CHECK on the column behind this: ROOM_PRIORITY_TIERS is committee-editable, and a constraint
// behind an editable list breaks writes the moment the list is used (0033's reasoning, C-115).
export const TIERS = ['PRODUCTION', 'COMMITTEE', 'REHEARSAL', 'GENERAL'] as const
export type Tier = (typeof TIERS)[number]

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value)
}

export interface Span {
  startsAt: number
  endsAt: number
}

// Half-open at both ends: a booking ending at 19:00 and one starting at 19:00 never conflict.
export function overlaps(a: Span, b: Span): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt
}

export interface Conflict extends Span {
  title?: string
  bookedBy?: string
}

// Rebuilt rather than edited, so nothing identifying can survive in a field the masking forgot.
export function maskConflicts(conflicts: Conflict[], canSeeDetail: boolean): Conflict[] {
  if (canSeeDetail) return conflicts
  return conflicts.map(conflict => ({ startsAt: conflict.startsAt, endsAt: conflict.endsAt, title: 'Booked' }))
}

const instant = z.string().datetime()

export const bookingForm = z.object({
  roomId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  startsAt: instant,
  endsAt: instant,
  attendees: z.number().int().positive().nullish().transform(value => value ?? null),
  tier: z.enum(TIERS).default('GENERAL'),
  notes: z.string().trim().max(1000).nullish().transform(value => (value ?? '').trim() || null),
}).refine(booking => new Date(booking.endsAt) > new Date(booking.startsAt), {
  path: ['endsAt'],
  message: 'A booking ends after it starts',
})

export type BookingInput = z.output<typeof bookingForm>
