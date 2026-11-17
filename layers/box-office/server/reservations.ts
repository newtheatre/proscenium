// Reserving now and paying on arrival (Box office specification, part 3, "Reserving now and paying
// on arrival"; R-1, R-2, R-7). A reserved order claims its seats exactly as a paid one does: its
// claims are confirmed with no expiry, under a hold of kind reservation, so capacity and the
// last-seat guarantee do not know the difference. It has no payment intent, no tickets and no
// ledger effect, because no money has moved.
//
// A buyer who is not signed in proves their address first, when the theatre asks for that: the
// basket stays a basket, its seats held for as long as any basket's, and the link in the email does
// the reserving. That link holds a random token and nothing else: its hash is on the basket with
// the address it was sent to, it works once, and it ends with the basket. The account is found or
// made only when the link is pressed, so a mistyped address leaves nothing behind.
import { sql } from 'drizzle-orm'
import { first, inAccountScope, nowMs, refuse, useContext, useSetting, type UnitView } from '#kit'
import { findOrCreateAccount, notify, notifyAddress } from '#modules/core'
import { methodsFor } from '#modules/payments'
import { cancellations } from './db/schema'
import { hashOf, newDeskCode, randomToken } from './codes'
import { confirmOrder, type Confirmed } from './confirm'
import { siteUrl } from './links'
import { liveLines, ORDER, RAN_OUT, wordsFor, type LineRow, type OrderRow } from './orders'
import { salesOf } from './setup'

export type PaymentTiming = 'pay-now' | 'reserve' | 'buyer-chooses'

/** Whether an online order for this performance is paid at checkout or reserved. */
export async function timingFor(performanceId: string): Promise<PaymentTiming> {
  // A theatre with no online payment provider can only take reservations.
  if (!(await methodsFor('online')).length) return 'reserve'
  return (await salesOf(performanceId))?.paymentTiming ?? await useSetting('box-office.checkout.payment-timing') as PaymentTiming
}

export interface ReserveInput {
  orderId: string
  /** The basket's token. */
  token: string
  /** What the buyer saw as the total, so a change of price is never a surprise at the desk. */
  expectedTotalMinor: number
  /** Needed when nobody is signed in. */
  email?: string | null
  name?: string | null
}

export interface Reserved {
  state: 'reserved'
  orderId: string
  reference: string
  /** Opens the order from now on. Shown once and never stored. */
  token: string
  /** Shown once and never stored. */
  deskCode: string
  currency: string
  amountDueMinor: number
  releaseAt: number | null
}

export type ReserveOutcome = Reserved | Confirmed | { state: 'confirm-email', orderId: string, expiresAt: number }

/**
 * Reserve, pressed on a basket. A signed-in buyer's basket is reserved at once; so is a guest's
 * when the theatre does not ask for a confirmed address. Otherwise the guest is sent the link that
 * does it.
 */
export async function requestReservation(unit: UnitView, input: ReserveInput): Promise<ReserveOutcome> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ? AND basket_token_hash = ?`, input.orderId, await hashOf(input.token))
  if (!order) refuse('box-office.basket.not-found', 'There is no such basket.', { status: 404 })
  const lines = await checkBasket(order, input.expectedTotalMinor)

  const actor = useContext().actor
  if (actor.kind === 'person' && actor.accountId) return reserve(unit, order, lines, actor.accountId, true)

  if (!input.email) refuse('box-office.reservation.email-needed', 'We need an email address to send your reservation to.', { status: 422, fields: { email: 'required' } })
  if (!await useSetting('box-office.reservations.confirm-email')) {
    const { accountId } = await findOrCreateAccount(unit, { address: input.email, name: input.name, origin: 'guest' })
    return reserve(unit, order, lines, accountId, false)
  }

  // Asked again, perhaps with the address put right: the earlier link stops working.
  const token = randomToken()
  const at = nowMs()
  unit.add(sql`UPDATE box_office_orders SET confirm_token_hash = ${await hashOf(token)}, confirm_expires_at = expires_at, confirm_email = ${input.email}, confirm_name = ${input.name ?? null}, updated_at = ${at}
    WHERE id = ${order.id} AND state = 'basket' AND expires_at > ${at}`).expect(1, RAN_OUT)
  const words = await wordsFor(order, lines, order.total_minor)
  await notifyAddress(unit, 'box-office.reservation-confirm', {
    address: input.email,
    variables: { link: await siteUrl(`/book/confirm/${token}`), show: words.show, when: words.when, until: words.timeOf(order.expires_at!) },
    record: ['box-office.order', order.id],
  })
  return { state: 'confirm-email', orderId: order.id, expiresAt: order.expires_at! }
}

/**
 * The link in the confirmation message: the address is proved, so its account is found or made and
 * the basket is reserved for it. A wrong, used or lapsed link gets the one answer.
 */
export async function confirmReservation(unit: UnitView, token: string): Promise<Reserved | Confirmed> {
  const order = token
    ? await first<OrderRow>(`${ORDER} WHERE confirm_token_hash = ? AND state = 'basket' AND confirm_expires_at > ?`, await hashOf(token), nowMs())
    : null
  if (!order) refuse('box-office.reservation.link-invalid', 'This link does not confirm a reservation. It may have been used already, or the seats were held for too short a time.', { status: 404, remedy: 'If your reservation was confirmed, its details are in the email that followed. Otherwise choose your tickets again.' })
  const lines = await checkBasket(order, order.total_minor)
  const { accountId } = await findOrCreateAccount(unit, { address: order.confirm_email, name: order.confirm_name, origin: 'guest' })
  return reserve(unit, order, lines, accountId, false)
}

// What can be told before the batch: the basket is still held, reserving is offered, and the size
// and total are as expected. The batch asserts again whatever a race could change.
async function checkBasket(order: OrderRow, expectedTotalMinor: number): Promise<LineRow[]> {
  if (order.state === 'reserved') refuse('box-office.reservation.already-reserved', 'These tickets are already reserved.', { status: 409, remedy: 'The details are in the email we sent.' })
  if (order.state !== 'basket' || order.expires_at === null || order.expires_at <= nowMs()) refuse(RAN_OUT.code, RAN_OUT.reason, { status: 409, remedy: RAN_OUT.remedy })
  const lines = await liveLines(order.id)
  if (!lines.length) refuse(RAN_OUT.code, RAN_OUT.reason, { status: 409, remedy: RAN_OUT.remedy })
  for (const performanceId of new Set(lines.map(l => l.performance_id))) {
    if (await timingFor(performanceId) === 'pay-now')
      refuse('box-office.reservation.not-offered', 'These tickets are paid for when you book.', { status: 409, remedy: 'Go on to payment.' })
  }
  if (order.total_minor !== expectedTotalMinor)
    refuse('box-office.order.total-changed', 'The total has changed since you last saw it.', { status: 409, remedy: 'Check the basket and try again.' })
  const most = await useSetting('box-office.reservations.max-tickets-per-order') as number
  if (lines.length > most) refuse('box-office.reservation.too-many', `At most ${most} tickets can be reserved in one booking.`, { status: 422, remedy: 'Reserve fewer, or ask the box office about a group.' })
  return lines
}

// Basket to reserved, in one batch (part 3): the limits are asserted where the reservation is
// written, so parallel reservations by one person cannot pass them between them.
async function reserve(unit: UnitView, order: OrderRow, lines: LineRow[], accountId: string, signedIn: boolean): Promise<Reserved | Confirmed> {
  // An order with nothing to pay never rests reserved: it is confirmed and its tickets issued at once.
  if (order.total_minor === 0) return confirmOrder(unit, order, lines, { from: 'basket', account: { id: accountId, signedIn } })
  const at = nowMs()
  const perPerson = await useSetting('box-office.reservations.max-tickets-per-person') as number
  const releaseBefore = await useSetting('box-office.reservations.release-before') as number | null
  const words = await wordsFor(order, lines, order.total_minor)
  const releaseAt = releaseBefore === null ? null : words.startsAt - releaseBefore * 1000 // not-policy: seconds to milliseconds

  const byPerformance = new Map<string, number>()
  for (const line of lines) byPerformance.set(line.performance_id, (byPerformance.get(line.performance_id) ?? 0) + 1)
  for (const [performanceId, quantity] of byPerformance) {
    // Reserved tickets this person already holds for the performance, under any account merged into theirs.
    unit.add(sql`UPDATE box_office_orders SET updated_at = updated_at WHERE id = ${order.id} AND ${quantity} + (
        SELECT count(*) FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id
        WHERE l.kind = 'ticket' AND l.state = 'live' AND l.performance_id = ${performanceId}
          AND o.state IN ('reserved', 'awaiting_payment') AND EXISTS (SELECT 1 FROM box_office_holds h WHERE h.order_id = o.id AND h.kind = 'reservation')
          AND ${inAccountScope('o.account_id', accountId)}) <= ${perPerson}`)
      .expect(1, { code: 'box-office.reservation.person-limit', reason: `One person can reserve at most ${perPerson} tickets for a performance.`, remedy: 'Change or cancel a reservation you already have, or ask the box office.' })
  }

  const token = randomToken()
  const deskCode = newDeskCode()
  unit.add(sql`UPDATE box_office_orders SET state = 'reserved', account_id = ${accountId}, signed_in = ${signedIn}, link_token_hash = ${await hashOf(token)},
      desk_code_hash = ${await hashOf(deskCode)}, expires_at = NULL, release_at = ${releaseAt}, updated_at = ${at},
      confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_email = NULL, confirm_name = NULL
    WHERE id = ${order.id} AND state = 'basket' AND expires_at > ${at} AND total_minor = ${order.total_minor}`)
    .expect(1, RAN_OUT)
  // Every seat of the basket is still held: none lapsed and was taken while the buyer read their email.
  unit.add(sql`UPDATE box_office_claims SET state = 'confirmed', expires_at = NULL
    WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${order.id})`)
    .expect(lines.length, RAN_OUT)
  unit.add(sql`UPDATE box_office_holds SET kind = 'reservation', updated_at = ${at} WHERE order_id = ${order.id} AND kind = 'basket'`).expect(1, RAN_OUT)

  unit.announce('box-office.order.reserved', { orderId: order.id, performanceIds: [...byPerformance.keys()] }, { record: ['box-office.order', order.id] })
  await notify(unit, 'box-office.order-reserved', {
    to: accountId,
    variables: { reference: order.reference, show: words.show, when: words.when, tickets: words.tickets, amountDue: words.amount, deskCode, link: await siteUrl(`/book/order/${token}`) },
    subject: ['box-office.order', order.id],
    dedupeKey: order.id,
  })
  return { state: 'reserved', orderId: order.id, reference: order.reference, token, deskCode, currency: order.currency, amountDueMinor: order.total_minor, releaseAt }
}

export interface OrderView {
  orderId: string
  reference: string
  state: string
  currency: string
  totalMinor: number
  /** What is still to pay: the whole total of a reservation, nothing once paid. */
  amountDueMinor: number
  releaseAt: number | null
  lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, ticketType: string, amountMinor: number }[]
}

/**
 * An order, for whoever holds the link from its message, in any state it reaches after the basket.
 * No sign-in, and no name or address shown.
 */
export async function orderByLink(token: string): Promise<OrderView | null> {
  const order = token ? await first<OrderRow>(`${ORDER} WHERE link_token_hash = ? AND state <> 'basket'`, await hashOf(token)) : null
  if (!order) return null
  const lines = await liveLines(order.id)
  return {
    orderId: order.id,
    reference: order.reference,
    state: order.state,
    currency: order.currency,
    totalMinor: order.total_minor,
    amountDueMinor: order.state === 'reserved' || order.state === 'awaiting_payment' ? order.total_minor : 0,
    releaseAt: order.release_at,
    lines: lines.map(l => ({ id: l.id, performanceId: l.performance_id, bandId: l.band_id, ticketTypeId: l.ticket_type_id, ticketType: l.type_name, amountMinor: l.amount_minor })),
  }
}

/**
 * Cancel or reduce a reservation from its link (R-2): the seats go back on sale in the same batch.
 * With no lines named, the whole reservation is cancelled. Nothing was paid, so nothing is refunded.
 */
export async function cancelFromLink(unit: UnitView, token: string, lineIds?: string[]): Promise<OrderView> {
  const order = token ? await first<OrderRow>(`${ORDER} WHERE link_token_hash = ?`, await hashOf(token)) : null
  if (!order || order.state === 'basket') refuse('box-office.order.not-found', 'This link does not open a booking.', { status: 404 })
  if (order.state !== 'reserved')
    refuse('box-office.order.cancel-at-desk', 'This booking cannot be changed from here.', { status: 409, remedy: 'Ask the box office.' })
  const lines = await liveLines(order.id)
  const chosen = lineIds ? lines.filter(l => lineIds.includes(l.id)) : lines
  if (!chosen.length || (lineIds && chosen.length !== new Set(lineIds).size))
    refuse('box-office.order.lines-changed', 'Those tickets are not on this reservation any more.', { status: 409, remedy: 'Reload to see what is reserved.' })
  const changed = { code: 'box-office.order.lines-changed', reason: 'This reservation has just changed.', remedy: 'Reload to see what is reserved.' }
  const at = nowMs()
  const ids = JSON.stringify(chosen.map(l => l.id))
  const kept = lines.filter(l => !chosen.includes(l))
  const totalMinor = kept.reduce((sum, l) => sum + l.amount_minor, 0)

  unit.add(sql`UPDATE box_office_order_lines SET state = 'cancelled', updated_at = ${at}
    WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(chosen.length, changed)
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'cancelled'
    WHERE state = 'confirmed' AND id IN (SELECT claim_id FROM box_office_order_lines WHERE order_id = ${order.id} AND id IN (SELECT value FROM json_each(${ids})))`).expect(chosen.length, changed)
  unit.add(kept.length
    ? sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`
    : sql`UPDATE box_office_orders SET state = 'cancelled', total_minor = ${totalMinor}, cancelled_at = ${at}, release_at = NULL, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`)
    .expect(1, changed)
  // By nobody the platform can name: whoever held the link.
  const [cancellationId] = unit.insertSet(cancellations, [{ orderId: order.id, kind: 'customer', lineIds: ids, feeMinor: 0, by: null }])

  unit.announce('box-office.order.cancelled', { orderId: order.id, cancellationId: cancellationId! }, { record: ['box-office.order', order.id] })
  const words = await wordsFor(order, lines, totalMinor)
  const left = await wordsFor(order, kept.length ? kept : lines, totalMinor)
  await notify(unit, 'box-office.order-cancelled', {
    to: order.account_id!,
    variables: {
      reference: order.reference,
      show: words.show,
      when: words.when,
      cancelled: chosen.length === 1 ? '1 ticket' : `${chosen.length} tickets`,
      remaining: kept.length ? `Still reserved: ${left.tickets}. To pay on arrival: ${left.amount}.` : 'Nothing is reserved on this booking now, and there is nothing to pay.',
    },
    subject: ['box-office.order', order.id],
  })
  return {
    orderId: order.id,
    reference: order.reference,
    state: kept.length ? 'reserved' : 'cancelled',
    currency: order.currency,
    totalMinor,
    amountDueMinor: totalMinor,
    releaseAt: kept.length ? order.release_at : null,
    lines: kept.map(l => ({ id: l.id, performanceId: l.performance_id, bandId: l.band_id, ticketTypeId: l.ticket_type_id, ticketType: l.type_name, amountMinor: l.amount_minor })),
  }
}
