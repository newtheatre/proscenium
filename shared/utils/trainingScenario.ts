/**
 * The invented night a trainee practises on. Frozen data in the shapes the
 * real endpoints return; no row of this is ever inserted (ADR-0032).
 */

export interface ScenarioTicket {
  pricePaid: number
  refundedAt: null
  ticketTypeName: string
}

export interface ScenarioBooking {
  id: string
  bookingRef: string
  status: 'PENDING' | 'COLLECTED' | 'CANCELLED' | 'NO_SHOW'
  customerName: string
  customerEmail: string
  performanceId: string
  tickets: ScenarioTicket[]
  /** Symbols the door would see, when the booking has a profile. */
  accessNeeds: string[] | null
}

export interface ScenarioPerformance {
  id: string
  startsAt: string
  showTitle: string
  venueName: string
}

/**
 * Names are obviously invented on purpose: a trainee must never wonder
 * whether the person on their screen is real.
 */
export const TRAINING_PERFORMANCES: readonly ScenarioPerformance[] = Object.freeze([
  {
    id: 'training-perf-1',
    startsAt: '2026-01-01T19:30:00.000Z',
    showTitle: 'The Rehearsal That Never Was (practice)',
    venueName: 'Practice House',
  },
  {
    id: 'training-perf-2',
    startsAt: '2026-01-01T21:30:00.000Z',
    showTitle: 'A Late One (practice)',
    venueName: 'Practice Studio',
  },
])

/**
 * The cases worth rehearsing, not a tidy happy path: an unpaid booking to
 * send to the counter, a party, an already-admitted rescan, a cancellation.
 */
export const TRAINING_BOOKINGS: readonly ScenarioBooking[] = Object.freeze([
  {
    id: 'training-res-1',
    bookingRef: 'TRAIN1',
    status: 'PENDING',
    customerName: 'Practice Customer One',
    customerEmail: 'one@practice.invalid',
    performanceId: 'training-perf-1',
    tickets: [
      { pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' },
      { pricePaid: 500, refundedAt: null, ticketTypeName: 'Concession' },
    ],
    accessNeeds: null,
  },
  {
    id: 'training-res-2',
    bookingRef: 'TRAIN2',
    status: 'COLLECTED',
    customerName: 'Practice Customer Two',
    customerEmail: 'two@practice.invalid',
    performanceId: 'training-perf-1',
    tickets: [{ pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' }],
    accessNeeds: null,
  },
  {
    id: 'training-res-3',
    bookingRef: 'TRAIN3',
    status: 'COLLECTED',
    customerName: 'Practice Party Of Four',
    customerEmail: 'four@practice.invalid',
    performanceId: 'training-perf-1',
    tickets: [
      { pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' },
      { pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' },
      { pricePaid: 500, refundedAt: null, ticketTypeName: 'Concession' },
      { pricePaid: 500, refundedAt: null, ticketTypeName: 'Concession' },
    ],
    accessNeeds: ['levelAccess', 'difficultyStanding'],
  },
  {
    id: 'training-res-4',
    bookingRef: 'TRAIN4',
    status: 'COLLECTED',
    customerName: 'Practice Customer Four',
    customerEmail: 'four2@practice.invalid',
    performanceId: 'training-perf-1',
    tickets: [{ pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' }],
    accessNeeds: null,
  },
  {
    id: 'training-res-5',
    bookingRef: 'TRAIN5',
    status: 'CANCELLED',
    customerName: 'Practice Customer Five',
    customerEmail: 'five@practice.invalid',
    performanceId: 'training-perf-1',
    tickets: [{ pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' }],
    accessNeeds: null,
  },
])

const REF = /^[A-Z0-9]{6}$/i

/**
 * The fixture's own lookup. It searches nothing but this file, so a real
 * reference typed into a sandbox finds nothing, which is the point.
 */
export function findTrainingBookings(term: string): ScenarioBooking[] {
  const query = term.trim().toLowerCase()
  if (query.length < 2) return []

  if (REF.test(query)) {
    return TRAINING_BOOKINGS.filter(booking => booking.bookingRef.toLowerCase() === query)
  }

  return TRAINING_BOOKINGS.filter(booking =>
    booking.customerName.toLowerCase().includes(query)
    || booking.customerEmail.toLowerCase().includes(query),
  ).slice(0, 10)
}

export function trainingPerformance(id: string): ScenarioPerformance | undefined {
  return TRAINING_PERFORMANCES.find(performance => performance.id === id)
}

export function trainingBooking(id: string): ScenarioBooking | undefined {
  return TRAINING_BOOKINGS.find(booking => booking.id === id)
}
