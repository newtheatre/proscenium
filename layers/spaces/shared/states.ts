// The words a room booking is made of (spec part 2 and part 3), shared by the server and screens.

export const BOOKABLE_KINDS = ['space', 'resource'] as const
export const CONTROLS = ['own', 'external'] as const
export const BOOKABLE_STATES = ['active', 'paused', 'archived'] as const
export const OPEN_TO = ['bookers', 'production-team', 'staff'] as const
export const PURPOSE_STATES = ['active', 'retired'] as const
export const FREQUENCIES = ['daily', 'weekly', 'fortnightly', 'monthly-by-weekday'] as const

export const BOOKING_STATES = ['requested', 'confirmed', 'declined', 'withdrawn', 'expired', 'cancelled', 'bumped', 'completed'] as const
export type BookingState = typeof BOOKING_STATES[number]

export const CLOSED_REASONS = ['by-booker', 'by-staff', 'performance', 'closure', 'higher-tier', 'bookable-removed', 'origin-removed'] as const
export type ClosedReason = typeof CLOSED_REASONS[number]

export const BOOKING_EVENT_KINDS = ['requested', 'confirmed', 'declined', 'withdrawn', 'expired', 'changed', 'cancelled', 'bumped', 'completed', 'no-show-set', 'no-show-cleared', 'external-placed', 'reminder-sent'] as const
export type BookingEventKind = typeof BOOKING_EVENT_KINDS[number]

/** Every move a booking may make (part 3, "Moves between states"). No other exists. */
export const MOVES: Readonly<Record<BookingState, readonly BookingState[]>> = {
  requested: ['confirmed', 'declined', 'withdrawn', 'expired'],
  confirmed: ['cancelled', 'bumped', 'completed'],
  declined: [],
  withdrawn: [],
  expired: [],
  cancelled: [],
  bumped: [],
  completed: [],
}

export const canMove = (from: BookingState, to: BookingState): boolean => MOVES[from].includes(to)

/** The states a booking may be in to make the move to `to`. */
export const movesInto = (to: BookingState): BookingState[] => BOOKING_STATES.filter(from => canMove(from, to))

/** Only a Confirmed booking occupies time. */
export const OCCUPIES: BookingState = 'confirmed'

/** Two windows overlap when each starts before the other ends; touching ends do not. */
export const overlaps = (a: { startsAt: number, endsAt: number }, b: { startsAt: number, endsAt: number }): boolean =>
  a.startsAt < b.endsAt && b.startsAt < a.endsAt
