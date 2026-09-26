import { notify } from './notify'
import { qrPng } from './qr'
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'
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
}

// Shared by the reservation write and the resend route, so a resend renders from the same
// template with the same QR rather than a second, driftable copy (D-108 criteria 1, 2).
export async function sendReservationConfirmation(event: H3Event | undefined, context: ConfirmationContext): Promise<void> {
  await notify(event, {
    userId: context.userId,
    type: 'reservation.confirmed',
    context: {
      name: '',
      reference: context.reference,
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      totalDue: saysPrice(context.totalPence),
      ...bookingLink(event, context.qrToken),
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
}

// A walk-up sold at the bar to somebody who gave an address (F-123 criterion 2): the door reads
// the same QR whether it arrived this way or was photographed off the till.
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
      ...bookingLink(event, context.qrToken),
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

  await notify(event, {
    userId: context.userId,
    type: 'reservation.cancelled',
    context: {
      name: '',
      reference: state.reference,
      show: state.showTitle,
      when: formatLondon(new Date(state.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    },
  })
}
