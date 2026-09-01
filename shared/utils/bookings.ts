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

// What the room is for, which is a different question from who wins a contested slot. The tier
// answers that; this answers what somebody would need the room to be like (C-119).
export const PURPOSES = [
  'REHEARSAL',
  'MEETING',
  'WORKSHOP',
  'AUDITION',
  'READ_THROUGH',
  'GET_IN',
  'SOCIAL',
  'STORAGE',
] as const
export type Purpose = (typeof PURPOSES)[number]

// What the importer writes where nobody was ever asked. `external_requests.purpose` is NOT NULL
// and the table cascades, so a rebuild to make it nullable is refused (0003, C-118).
export const UNRECORDED_PURPOSE = 'UNRECORDED'

export function isPurpose(value: string): value is Purpose {
  return (PURPOSES as readonly string[]).includes(value)
}

// For reading rather than writing: ROOM_PURPOSES is committee-editable and history carries
// purposes nobody was asked for, so an unregistered one reads as itself (0027's habit).
export function describePurpose(value: string | null): string {
  if (!value || value === UNRECORDED_PURPOSE) return 'Not recorded'
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
}

// A member cancels what still holds a slot; everything else has already been decided, and the
// slot may be somebody else's by now (C-112 criterion 5).
export const CANCELLABLE: readonly BookingStatus[] = ['CONFIRMED', 'PENDING_APPROVAL']

// One refusal for a booking that is not yours and one that does not exist, because a member who
// may not see a booking may not learn that it is there either.
export function refusalToCancel(booking: { userId: string, status: string }, viewerId: string): string | null {
  if (booking.userId !== viewerId) return 'That is not your booking'
  if (!CANCELLABLE.includes(booking.status as BookingStatus)) {
    return `That booking is already ${booking.status.toLowerCase().replace('_', ' ')}`
  }
  return null
}

// Which of the two a member meant. There is no default: a single button that might cancel one
// week or a whole term is the ambiguity C-111 criterion 1 exists to remove.
export const SCOPES = ['occurrence', 'series'] as const
export type Scope = (typeof SCOPES)[number]

export const cancelForm = z.object({
  scope: z.enum(SCOPES).nullish().transform(value => value ?? null),
})

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
  // Validated against ROOM_PURPOSES at the write path, never a zod enum: the list is
  // committee-editable, and a frozen one breaks the moment they add to it (0033's reasoning).
  purpose: z.string().trim().min(1, 'Say what the room is for').max(32),
  notes: z.string().trim().max(1000).nullish().transform(value => (value ?? '').trim() || null),
}).refine(booking => new Date(booking.endsAt) > new Date(booking.startsAt), {
  path: ['endsAt'],
  message: 'A booking ends after it starts',
})

export type BookingInput = z.output<typeof bookingForm>
