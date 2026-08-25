/**
 * The invented night a trainee practises on, in the shapes the real endpoints
 * return. No row of it is ever inserted (ADR-0032); its dates move (ADR-0045).
 */

import { daysAfter, londonInstant } from './londonTime'

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
  showTitle: string
  venueName: string
  /** Curtain-up as a Europe/London wall clock, the same on whatever night. */
  curtain: string
  /** Show nights after tonight. 0 runs tonight; the rest deliberately do not. */
  nightsAhead: number
}

export interface DatedPerformance extends ScenarioPerformance {
  startsAt: string
  /** By the caller's window, which is the rule the real routes scope with. */
  isTonight: boolean
}

/**
 * Names are obviously invented on purpose: a trainee must never wonder
 * whether the person on their screen is real.
 */
export const TRAINING_PERFORMANCES: readonly ScenarioPerformance[] = Object.freeze([
  {
    id: 'training-perf-1',
    showTitle: 'The Rehearsal That Never Was (practice)',
    venueName: 'Practice House',
    curtain: '19:30',
    nightsAhead: 0,
  },
  {
    id: 'training-perf-2',
    showTitle: 'A Late One (practice)',
    venueName: 'Practice Studio',
    curtain: '21:30',
    nightsAhead: 0,
  },
  {
    // The advance-payment case: payable at the till, invisible at the door.
    id: 'training-perf-3',
    showTitle: 'The One Next Week (practice)',
    venueName: 'Practice House',
    curtain: '19:30',
    nightsAhead: 7,
  },
])

/**
 * The fixture dated against a show night. `isTonight` is decided by the window
 * the caller passes, so the sandbox cannot answer differently (ADR-0045).
 */
export function trainingPerformances(night: string, tonight: { from: Date, to: Date }): DatedPerformance[] {
  return TRAINING_PERFORMANCES.map((performance) => {
    const [hours, minutes] = performance.curtain.split(':').map(Number) as [number, number]
    const startsAt = londonInstant(daysAfter(night, performance.nightsAhead), hours, minutes, 0, 0)
    return {
      ...performance,
      startsAt: startsAt.toISOString(),
      isTonight: startsAt >= tonight.from && startsAt <= tonight.to,
    }
  })
}

/**
 * The cases worth rehearsing, not a tidy happy path: an unpaid booking, a
 * party, an advance booking for another night, a rescan, a cancellation.
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
    // Another night, so the till's advance-payment case is reachable and the
    // door, which searches tonight only, finds nothing (ADR-0045).
    id: 'training-res-4',
    bookingRef: 'TRAIN4',
    status: 'PENDING',
    customerName: 'Practice Customer Four',
    customerEmail: 'four2@practice.invalid',
    performanceId: 'training-perf-3',
    tickets: [
      { pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' },
      { pricePaid: 700, refundedAt: null, ticketTypeName: 'Standard' },
    ],
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

/** The undated fixture, for a caller with no show night to date it against. */
export function trainingPerformance(id: string): ScenarioPerformance | undefined {
  return TRAINING_PERFORMANCES.find(performance => performance.id === id)
}

export function trainingBooking(id: string): ScenarioBooking | undefined {
  return TRAINING_BOOKINGS.find(booking => booking.id === id)
}
