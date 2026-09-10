import { z } from 'zod'
import { plural } from './text'

// The booking flow (D-104): a guest or a signed-in account holds seats online, the box office
// takes payment in person, and nothing here ever moves money (0005).

// The reservation lifecycle itself is `RESERVATION_STATUSES` in `shared/utils/capacity.ts` (D-105);
// this file is what D-104 adds on top of it.
export const RESERVATION_SOURCES = ['WEB', 'DESK', 'DOOR'] as const

export type ReservationSource = (typeof RESERVATION_SOURCES)[number]

// Fixed by the criterion text, not a workshop number: 30 attempts in 10 minutes per address is
// what D-104 criterion 5 asks for, distinct from the per-order seat cap (PUBLIC_ORDER_SEAT_CAP).
export const RESERVATION_IP_LIMIT = 30
export const RESERVATION_IP_WINDOW_MINUTES = 10
export const RESERVATION_EMAIL_LIMIT = 8
export const RESERVATION_EMAIL_WINDOW_MINUTES = 60

// No look-alikes, matching the recovery-code alphabet: a reference is read aloud at a desk and
// typed into a search box, never a credential on its own (docs/data-model.md).
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const RESERVATION_REFERENCE_LENGTH = 6
const REFERENCE_SHAPE = new RegExp(`^[${REFERENCE_ALPHABET}]{${RESERVATION_REFERENCE_LENGTH}}$`)

export function generateReservationReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RESERVATION_REFERENCE_LENGTH))
  return [...bytes].map(byte => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
}

// The alphabet excludes O, 0, 1 and I, so a six-letter name (Booker) can never be mistaken for
// one: length alone is not enough to tell a desk search's reference from a name (D-114 criterion 1).
export function looksLikeReference(value: string): boolean {
  return REFERENCE_SHAPE.test(value.toUpperCase())
}

// A structural ceiling only, well above anything a real order asks for: the actual cap is
// `PUBLIC_ORDER_SEAT_CAP`, read at request time because it is configuration (0019).
const MAX_LINE_QUANTITY = 999
const MAX_LINES = 20

export const reservationLineForm = z.object({
  ticketTypeId: z.string().trim().min(1),
  quantity: z.number().int().positive().max(MAX_LINE_QUANTITY),
})

export const guestDetailsForm = z.object({
  name: z.string().trim().min(1).max(200),
  // 320 is the longest address RFC 5321 permits: 64 local, an @, 255 domain.
  email: z.string().email().max(320),
})

export type GuestDetails = z.output<typeof guestDetailsForm>

export const reservationForm = z.strictObject({
  performanceId: z.string().trim().min(1),
  lines: z.array(reservationLineForm).min(1).max(MAX_LINES)
    .refine(
      lines => new Set(lines.map(line => line.ticketTypeId)).size === lines.length,
      'A ticket type appears once; add to its quantity instead of a second line',
    ),
  // Ignored when the request carries a session; required otherwise (criterion 1).
  guest: guestDetailsForm.optional(),
})

export type ReservationInput = z.output<typeof reservationForm>

export function totalTickets(lines: { quantity: number }[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0)
}

// Criterion 2: the cap applies per line as well as to the order total, so a single line asking
// for more than the house allows online is refused the same as a large order split across lines.
export function overCapReason(lines: { quantity: number }[], cap: number): string | null {
  if (lines.some(line => line.quantity > cap) || totalTickets(lines) > cap) {
    return `Online orders are capped at ${plural(cap, 'ticket')}; for a larger party, contact the box office directly.`
  }
  return null
}

// D-106: the hold release point, in minutes before curtain. A performance's own value wins;
// null inherits the configured default, the same NULL-means-inherit rule the booking window uses.
export function resolveHoldReleaseMinutes(performanceOverride: number | null, defaultMinutes: number): number {
  return performanceOverride ?? defaultMinutes
}

// The instant an unpaid hold releases, in integer seconds UTC: measured back from curtain, never
// across a wall clock, so the clocks changing does not move it relative to the performance (0014).
export function holdExpiresAt(startsAt: number, minutesBefore: number): number {
  return startsAt - minutesBefore * 60
}

// Decision: a booking this close to curtain is refused outright rather than held and released
// minutes later. Keeping these seats sellable at the door is the release window's own point.
export function bornExpiredReason(holdExpiresAt: number, now: number): string | null {
  if (holdExpiresAt > now) return null
  return 'Online booking cannot hold seats this close to curtain. Contact the box office directly, '
    + 'or come to the theatre in person; tickets may still be available on the door.'
}

// D-107 criterion 2: keyed on the expiry it warns about, not the reservation alone, so a hold
// whose expiry moves re-arms the reminder instead of finding the old claim already taken.
export function holdReminderClaim(reservationId: string, expiresAt: number): string {
  return `reservation.hold-expiring:${reservationId}:${expiresAt}`
}

export const reservationResendForm = z.object({
  reference: z.string().trim().length(RESERVATION_REFERENCE_LENGTH),
  email: z.string().email().max(320),
})

// D-110: self-service edit while unpaid. Desired totals per type, the same shape a fresh
// booking uses, so "each type appears at most once" is one rule either way (criterion 1).
export const reservationEditForm = z.strictObject({
  lines: z.array(reservationLineForm).min(1).max(MAX_LINES)
    .refine(
      lines => new Set(lines.map(line => line.ticketTypeId)).size === lines.length,
      'A ticket type appears once; add to its quantity instead of a second line',
    ),
})

export type ReservationEditInput = z.output<typeof reservationEditForm>

export const reservationExchangeForm = z.strictObject({
  performanceId: z.string().trim().min(1),
})

export type ReservationExchangeInput = z.output<typeof reservationExchangeForm>

export interface TicketTypeCount {
  ticketTypeId: string
  quantity: number
}

export interface TicketEditDelta {
  additions: TicketTypeCount[]
  removals: TicketTypeCount[]
  desiredTotal: number
}

// What moves to reach the desired counts from what is currently held, per type: never a whole
// replacement, so an untouched line's ticket rows and their snapshotted prices stay put.
export function ticketEditDelta(current: TicketTypeCount[], desired: TicketTypeCount[]): TicketEditDelta {
  const have = new Map(current.map(line => [line.ticketTypeId, line.quantity]))
  const want = new Map(desired.map(line => [line.ticketTypeId, line.quantity]))
  const types = new Set([...have.keys(), ...want.keys()])

  const additions: TicketTypeCount[] = []
  const removals: TicketTypeCount[] = []
  for (const ticketTypeId of types) {
    const before = have.get(ticketTypeId) ?? 0
    const after = want.get(ticketTypeId) ?? 0
    if (after > before) additions.push({ ticketTypeId, quantity: after - before })
    else if (before > after) removals.push({ ticketTypeId, quantity: before - after })
  }

  return { additions, removals, desiredTotal: desired.reduce((total, line) => total + line.quantity, 0) }
}

// Criterion 2: a reservation with nothing left is a cancellation, not an edit.
export function belowMinimumTicketsReason(desiredTotal: number): string | null {
  if (desiredTotal >= 1) return null
  return 'A booking must keep at least one ticket. Cancel it instead if none are wanted.'
}

// Criterion 3: cancellation this close to curtain has nowhere useful to send the freed seats.
export function pastCurtainReason(startsAt: number, now: number): string | null {
  if (startsAt > now) return null
  return 'This performance has already started, so it can no longer be cancelled online. Contact the box office directly.'
}

// D-111 criterion 5: a different show is cancel and rebook, never an exchange.
export function differentShowReason(currentShowId: string, targetShowId: string): string | null {
  if (currentShowId === targetShowId) return null
  return 'Only another performance of the same show can be exchanged into. Cancel this booking and make a new one for a different show.'
}

// The same performance is not a real exchange; refusing it early is a clearer answer than a
// capacity check that would always pass against seats this booking already holds.
export function sameNightReason(currentPerformanceId: string, targetPerformanceId: string): string | null {
  if (currentPerformanceId !== targetPerformanceId) return null
  return 'This booking is already for that performance.'
}

export interface QrExchangedTo {
  showTitle: string
  when: string
}

export interface QrStatusDisplay {
  headline: string
  detail: string | null
}

// What the QR page (and eventually the door, D-126) says for each state a reservation can be
// in when the code is presented, loudly distinct from every other (D-108 criterion 5).
export function qrStatusDisplay(
  status: string,
  cancelledBy: string | null,
  totalDue: string | null,
  exchangedTo: QrExchangedTo | null = null,
): QrStatusDisplay {
  switch (status) {
    case 'PENDING':
      return { headline: 'Unpaid', detail: totalDue ? `${totalDue} due at the box office on the night.` : null }
    case 'COLLECTED':
      return { headline: 'Paid', detail: 'Collected at the box office.' }
    case 'DOOR':
      return { headline: 'Admitted', detail: 'Already checked in at the door.' }
    case 'EXPIRED':
      return { headline: 'Lapsed', detail: 'This hold was released. Contact the box office if you still want to attend.' }
    case 'CANCELLED':
      // Exchanged is cancelled-with-a-pointer (D-111), not a fourth status: `reservations.status`
      // carries a restrict-FK'd dependent, so its CHECK constraint cannot be extended (0010).
      if (exchangedTo) {
        return { headline: 'Exchanged', detail: `Exchanged for ${exchangedTo.showTitle}, ${exchangedTo.when}.` }
      }
      return {
        headline: 'Cancelled',
        detail: cancelledBy === 'CUSTOMER' ? 'Cancelled by the booker.' : 'Cancelled by the box office.',
      }
    case 'NO_SHOW':
      return { headline: 'No-show', detail: 'Recorded as not attended.' }
    default:
      return { headline: status, detail: null }
  }
}

// D-126's own shape: a pass reference typed or scanned, and the performance chosen at the door.
export const doorTicketScanForm = z.strictObject({
  reference: z.string().trim().min(1),
  performanceId: z.string().trim().min(1),
})

export type DoorTicketScanInput = z.output<typeof doorTicketScanForm>

export interface DoorTicketOutcome {
  headline: string
  detail: string | null
  admit: boolean
}

// D-108 criterion 5's fifth state, and E-127 criterion 3's refusal: only PENDING or COLLECTED
// is ever asked whether it matches the door's own performance; every other state explains itself.
export function doorTicketOutcome(
  status: string,
  cancelledBy: string | null,
  performanceId: string,
  selectedPerformanceId: string,
  showTitle: string,
  when: string,
  totalDue: string | null,
  exchangedTo: QrExchangedTo | null = null,
): DoorTicketOutcome {
  if (performanceId !== selectedPerformanceId && (status === 'PENDING' || status === 'COLLECTED')) {
    return { headline: 'Wrong performance', detail: `This ticket is for ${showTitle}, ${when}.`, admit: false }
  }
  if (status === 'COLLECTED') return { headline: 'Admit', detail: null, admit: true }
  return { ...qrStatusDisplay(status, cancelledBy, totalDue, exchangedTo), admit: false }
}
