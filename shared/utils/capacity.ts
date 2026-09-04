import { plural } from './text'

// Capacity is a count of seats held right now, never a stored number (D-105, 0006). A seat is held
// by a reservation status and released by one, so releasing a seat is a status change and nothing else.

// Every state a reservation can be in. D-104 builds the table; the vocabulary is fixed here because
// the capacity rule is what reads it (docs/data-model.md).
export const RESERVATION_STATUSES = ['PENDING', 'COLLECTED', 'DOOR', 'EXPIRED', 'CANCELLED', 'NO_SHOW'] as const

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

// Held: somebody is coming, or has paid and is coming. A ticket under one of these occupies a seat.
export const HOLDING_STATUSES = ['PENDING', 'COLLECTED', 'DOOR'] as const

// Released: the seat is back in the house the moment the status moves, with nothing to sweep.
export const RELEASING_STATUSES = ['EXPIRED', 'CANCELLED', 'NO_SHOW'] as const

export function holdsSeat(status: ReservationStatus, refundedAt: number | null): boolean {
  if (refundedAt !== null) return false
  return (HOLDING_STATUSES as readonly string[]).includes(status)
}

export function seatsHeldBy(tickets: { status: ReservationStatus, refundedAt: number | null }[]): number {
  return tickets.filter(ticket => holdsSeat(ticket.status, ticket.refundedAt)).length
}

// Null capacity is an uncapped venue, which refuses nothing.
export function remainingIn(capacity: number | null, held: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - held)
}

export interface CapacityRefusal {
  says: string
  capacity: number
  held: number
  remaining: number
}

// Why this house cannot take this order, or null when it can. The refusal quotes both figures, so
// a booker is told what is left rather than that something went wrong (D-105 criterion 1).
export function capacityRefusal(capacity: number | null, held: number, wanted: number): CapacityRefusal | null {
  if (capacity === null) return null
  const remaining = remainingIn(capacity, held) ?? 0
  if (wanted <= remaining) return null

  return {
    says: remaining === 0
      ? 'This performance is sold out'
      : `There ${remaining === 1 ? 'is' : 'are'} ${plural(remaining, 'ticket')} left for this performance, `
        + `and you asked for ${wanted}`,
    capacity,
    held,
    remaining,
  }
}

// Criterion 4: a deliberate oversell is done by raising capacity, never by lowering it under what
// is already held. The refusal quotes both figures so the operator can see the gap.
export function loweringRefusal(capacity: number | null, held: number): string | null {
  if (capacity === null || capacity >= held) return null
  return `${plural(held, 'ticket')} ${held === 1 ? 'is' : 'are'} already held on this performance, `
    + `so its capacity cannot be ${capacity}`
}
