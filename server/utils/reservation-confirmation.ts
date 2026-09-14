import { notify } from './notify'
import { qrPng } from './qr'
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'
import type { H3Event } from 'h3'

// Kept apart from server/utils/reservations.ts, which `tests/` imports directly under Bun:
// `useRuntimeConfig()` needs a real Nitro runtime, so nothing reachable from a unit test may call it.

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
  const url = `${useRuntimeConfig(event).public.baseURL}/qr/${context.qrToken}`
  // The width is the bitmap's own, so the email never scales the code and blurs the modules.
  const { width } = qrPng(url)
  await notify(event, {
    userId: context.userId,
    type: 'reservation.confirmed',
    context: {
      name: '',
      reference: context.reference,
      show: context.showTitle,
      when: formatLondon(new Date(context.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      totalDue: saysPrice(context.totalPence),
      url,
      imageUrl: `${url}/image.png`,
      qrWidth: width,
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
