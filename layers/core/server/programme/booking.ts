// The booking action for each performance (core.booking-action). Contributions are asked in order
// and the first to answer for a performance wins. A performance none answers for books through its
// own external link, then its production's; with neither it has no button.
import { usePoint } from '#kit'
import type { BookingAction, BookingAnswer, BookingSubject, PriceSummary } from '../points/booking-action'

export interface BookingTarget extends BookingSubject {
  externalBookingUrl: string | null
  productionBookingUrl: string | null
}

/** An answer, marked `external` where it is the theatre's own link rather than a module's. */
export type ShownBooking = BookingAnswer & { external?: true }

/** Booking actions for performances the caller has already judged bookable: scheduled and not yet over. */
export async function bookingActions(performances: BookingTarget[]): Promise<Record<string, ShownBooking>> {
  const out: Record<string, ShownBooking> = {}
  if (!performances.length) return out
  const subjects: BookingSubject[] = performances.map(({ id, productionId, startsAt, endsAt, capacity }) => ({ id, productionId, startsAt, endsAt, capacity }))
  for (const contribution of await usePoint<BookingAction>('core.booking-action')) {
    const unanswered = subjects.filter(s => !out[s.id])
    if (!unanswered.length) break
    const answers = await contribution.value.actions(unanswered)
    // Only the performances asked about: an answer for any other is ignored.
    for (const s of unanswered) if (answers[s.id]) out[s.id] = answers[s.id]!
  }
  for (const p of performances) {
    const link = p.externalBookingUrl ?? p.productionBookingUrl
    if (!out[p.id] && link) out[p.id] = { state: 'available', link, external: true }
  }
  return out
}

/** What each production is sold at, from the first contribution that says; a production none prices is left out. */
export async function priceSummaries(productionIds: string[]): Promise<Record<string, PriceSummary>> {
  const out: Record<string, PriceSummary> = {}
  if (!productionIds.length) return out
  for (const contribution of await usePoint<BookingAction>('core.booking-action')) {
    const unanswered = productionIds.filter(id => !out[id])
    if (!unanswered.length || !contribution.value.prices) continue
    const answers = await contribution.value.prices(unanswered)
    for (const id of unanswered) if (answers[id]) out[id] = answers[id]!
  }
  return out
}
