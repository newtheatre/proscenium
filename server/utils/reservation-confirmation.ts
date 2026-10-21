import { notify } from './notify'
import { qrPng } from './qr'
import { bookingGuidance, referenceShowScope } from './whats-on'
import { holdExpiresAtByReference, namedTicketLines, reservationCurrentState, reservationIdByReference } from './reservations'
import { formatLondon } from '#shared/utils/london'
import { nothingToCollect } from '#shared/utils/reservations'
import { saysPrice } from '#shared/utils/ticket-types'
import { saysClock } from '#shared/utils/when'
import type { BookingLink } from './holds'
import type { H3Event } from 'h3'

// Kept apart from server/utils/reservations.ts, which `tests/` imports directly under Bun:
// `useRuntimeConfig()` needs a real Nitro runtime, so nothing reachable from a unit test may call it.

// The booking page and its QR as a hosted PNG, never an SVG, which Gmail will not render (D-108
// criterion 2). The width is the bitmap's own, so the email never scales and blurs the code.
function bookingLink(event: H3Event | undefined, qrToken: string): BookingLink {
  const url = `${useRuntimeConfig(event).public.baseURL}/qr/${qrToken}`
  return { url, imageUrl: `${url}/image.png`, qrWidth: qrPng(url).width }
}

export async function bookingLinkFor(event: H3Event | undefined, reservationId: string): Promise<BookingLink> {
  return bookingLink(event, await qrTokenFor(reservationId))
}

export interface ConfirmationContext {
  userId: string
  reference: string
  showTitle: string
  startsAt: number
  totalPence: number
  qrToken: string
  // A fresh copy after a change or an exchange says which, and an exchange names the booking it
  // replaced, whose reference no longer admits anybody (0122).
  change?: 'CHANGED' | 'EXCHANGED'
  replaces?: string
}

// Where, when the doors open, when the hold is let go and each line's price, read from the booking
// itself so every path that sends a confirmation says the same (D-106 criterion 1, 0122).
async function arrivalContext(reference: string): Promise<Record<string, unknown>> {
  const id = await reservationIdByReference(reference)
  if (!id) return {}
  const [state, lines] = await Promise.all([reservationCurrentState(id), namedTicketLines(id)])
  if (!state) return {}
  return {
    venue: state.venueName,
    venueAddress: state.venueAddress,
    doors: state.doorsAt ? saysClock(state.doorsAt) : null,
    releasesAt: state.holdExpiresAt ? saysClock(state.holdExpiresAt) : null,
    lines: lines.map(line => ({ name: line.ticketTypeName, quantity: Number(line.quantity), total: saysPrice(Number(line.totalPence)) })),
  }
}

// Shared by the reservation write and the resend route, so a resend renders from the same
// template with the same QR rather than a second, driftable copy (D-108 criteria 1, 2).
export async function sendReservationConfirmation(event: H3Event | undefined, context: ConfirmationContext): Promise<void> {
  // The e-ticket carries the show's guidance from the rows the show page reads (D-102 criterion 4).
  const [shown, holdExpiresAt, arrival] = await Promise.all([
    bookingGuidance(referenceShowScope(context.reference)),
    holdExpiresAtByReference(context.reference),
    arrivalContext(context.reference),
  ])
  await notify(event, {
    userId: context.userId,
    type: 'reservation.confirmed',
    context: {
      name: '',
      reference: context.reference,
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      totalDue: saysPrice(context.totalPence),
      // A pass booking owes nothing, so it never reads "£0.00 is due" (issue 1390).
      nothingDue: nothingToCollect(holdExpiresAt, context.totalPence),
      ...bookingLink(event, context.qrToken),
      guidance: shown?.lines ?? [],
      showUrl: shown?.slug ? `${useRuntimeConfig(event).public.baseURL}/shows/${shown.slug}` : null,
      ...arrival,
      ...(context.change ? { change: context.change } : {}),
      ...(context.replaces ? { replaces: context.replaces } : {}),
    },
  })
}

export interface WalkUpPaidContext {
  userId: string
  reference: string
  showTitle: string
  startsAt: number
  paidPence: number
  qrToken: string
  // Where the money was taken, which the email names: the till's walk-up or the desk's (D-115).
  paidAt: 'BAR' | 'DESK'
  // A comp collected at the desk: nothing was paid, so the email says it was given.
  comp?: boolean
}

// A walk-up sold to somebody who gave an address (F-123 criterion 2, D-115 criterion 6): the door
// reads the same QR whether it arrived this way or was photographed off the till.
export async function sendWalkUpPaid(event: H3Event | undefined, context: WalkUpPaidContext): Promise<void> {
  await notify(event, {
    userId: context.userId,
    type: 'reservation.walk-up-paid',
    context: {
      name: '',
      reference: context.reference,
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      paid: saysPrice(context.paidPence),
      paidAt: context.paidAt,
      comp: context.comp === true,
      ...bookingLink(event, context.qrToken),
    },
  })
}

export interface RefundedContext {
  userId: string
  reservationId: string
  refundedPence: number
  // The last ticket: the desk cancels the booking once nothing is left on it (D-116 criterion 6).
  cancelled: boolean
}

// Money handed back at the desk is told to the booker, with what is left of the booking, so a
// refund never shows only as "Cancelled by the box office" (process map, 21 October).
export async function sendReservationRefunded(event: H3Event | undefined, context: RefundedContext): Promise<void> {
  const state = await reservationCurrentState(context.reservationId)
  if (!state) return
  await notify(event, {
    userId: context.userId,
    type: 'reservation.refunded',
    context: {
      name: '',
      reference: state.reference,
      show: state.showTitle,
      when: formatLondon(new Date(state.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      refunded: saysPrice(context.refundedPence),
      cancelled: context.cancelled,
    },
  })
}

export interface CancellationContext {
  userId: string
  reservationId: string
}

// D-110 criterion 3: a booker cancelling their own hold hears back, the same way one collected
// or refunded already does. Read live, not from what the caller had in hand.
export async function sendReservationCancellation(event: H3Event | undefined, context: CancellationContext): Promise<void> {
  const state = await reservationCurrentState(context.reservationId)
  if (!state) return
  // Linked so booking again is a click, the show page only while it is still public (0122).
  const shown = await bookingGuidance(referenceShowScope(state.reference))
  const baseURL = useRuntimeConfig(event).public.baseURL

  await notify(event, {
    userId: context.userId,
    type: 'reservation.cancelled',
    context: {
      name: '',
      reference: state.reference,
      show: state.showTitle,
      when: formatLondon(new Date(state.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      showUrl: shown?.slug ? `${baseURL}/shows/${shown.slug}` : null,
      whatsOnUrl: `${baseURL}/whats-on`,
    },
  })
}
