// Checkout (Box office specification, part 3, "An order": basket to awaiting payment). Pressing Pay
// creates the payment intent through Payments, with one part for the order, and moves the hold into
// the payment window: its kind becomes `payment`, so nothing of Box office's releases it, and
// Payments ends it through the settlement handler when the payment has an answer. An order with
// nothing to pay is confirmed at once instead, with no intent and no posting.
import { sql } from 'drizzle-orm'
import { first, nowMs, refuse, useContext, useSetting, type UnitView } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { stampTerms } from './terms'
import { collect, methodsFor, refreshIntent, startAttempt, type StartResult } from '#modules/payments'
import { basketByToken, type BasketView } from './baskets'
import { hashOf } from './codes'
import { confirmOrder, type Confirmed } from './confirm'
import { assertAgeConfirmed, liveLines, ORDER, RAN_OUT, type OrderRow } from './orders'
import { timingFor } from './reservations'

export interface CheckoutInput {
  orderId: string
  /** The basket's token. */
  token: string
  /** What the buyer saw as the total. */
  expectedTotalMinor: number
  /** Needed when nobody is signed in. */
  email?: string | null
  name?: string | null
  /** That everyone using the tickets is old enough, for a production only for people over an age. */
  ageConfirmed?: boolean
}

export interface AwaitingPayment {
  state: 'awaiting_payment'
  orderId: string
  intentId: string
  currency: string
  amountMinor: number
  /** When the seats stop being held if the payment has not been made. */
  expiresAt: number
}

async function basketFor(orderId: string, token: string): Promise<OrderRow> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ? AND basket_token_hash = ?`, orderId, await hashOf(token))
  if (!order) refuse('box-office.basket.not-found', 'There is no such basket.', { status: 404 })
  return order
}

export async function startCheckout(unit: UnitView, input: CheckoutInput): Promise<AwaitingPayment | Confirmed> {
  const order = await basketFor(input.orderId, input.token)
  const at = nowMs()
  if (order.state !== 'basket' || order.expires_at === null || order.expires_at <= at) refuse(RAN_OUT.code, RAN_OUT.reason, { status: 409, remedy: RAN_OUT.remedy })
  const lines = await liveLines(order.id)
  if (!lines.length) refuse(RAN_OUT.code, RAN_OUT.reason, { status: 409, remedy: RAN_OUT.remedy })
  await assertAgeConfirmed(lines, input.ageConfirmed)
  if (order.total_minor !== input.expectedTotalMinor) {
    const money = (minor: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: order.currency }).format(minor / 100) // not-policy: minor units to units
    refuse('box-office.order.total-changed', `The total is now ${money(order.total_minor)}, not ${money(input.expectedTotalMinor)}.`, { status: 409, remedy: 'Check the basket and try again.' })
  }
  if (order.total_minor > 0) {
    for (const performanceId of new Set(lines.map(l => l.performance_id))) {
      if (await timingFor(performanceId) === 'reserve')
        refuse('box-office.checkout.reserve-only', 'These tickets are reserved now and paid for at the box office.', { status: 409, remedy: 'Reserve them instead.' })
    }
  }

  const actor = useContext().actor
  const signedIn = actor.kind === 'person' && !!actor.accountId
  if (!signedIn && !input.email) refuse('box-office.checkout.email-needed', 'We need an email address to send your tickets to.', { status: 422, fields: { email: 'required' } })
  const found = signedIn ? null : await findOrCreateAccount(unit, { address: input.email, name: input.name, origin: 'guest' })
  const accountId = found ? found.accountId : actor.accountId!
  await stampTerms(unit, order.id)

  if (order.total_minor === 0) return confirmOrder(unit, order, lines, { from: 'basket', account: { id: accountId, signedIn, madeWith: found?.madeWith, address: found ? input.email : null } })

  const expiresAt = at + (await useSetting('box-office.baskets.pay-within') as number) * 1000 // not-policy: seconds to milliseconds
  const { intentId } = await collect(unit, { parts: [{ owner: { module: 'box-office', record: order.id }, amountMinor: order.total_minor }], currency: order.currency, expiresAt })
  // Booked signed out, the address typed is kept until payment, so the tickets go to it.
  unit.add(sql`UPDATE box_office_orders SET state = 'awaiting_payment', account_id = ${accountId}, signed_in = ${signedIn}, intent_id = ${intentId}, expires_at = ${expiresAt}, updated_at = ${at},
      confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_email = ${found ? input.email ?? null : null}, confirm_name = NULL
    WHERE id = ${order.id} AND state = 'basket' AND expires_at > ${at} AND total_minor = ${order.total_minor}`).expect(1, RAN_OUT)
  // The seats move into the payment window, all of them still held.
  unit.add(sql`UPDATE box_office_claims SET expires_at = ${expiresAt}
    WHERE state = 'held' AND displaced_for_id IS NULL AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${order.id})`).expect(lines.length, RAN_OUT)
  unit.add(sql`UPDATE box_office_holds SET kind = 'payment', updated_at = ${at} WHERE order_id = ${order.id} AND kind = 'basket'`).expect(1, RAN_OUT)
  return { state: 'awaiting_payment', orderId: order.id, intentId, currency: order.currency, amountMinor: order.total_minor, expiresAt }
}

/**
 * Starts the payment with an online provider, for whoever holds the basket's token: the first
 * online method Payments offers, or the provider account named. What comes back says where the
 * buyer goes next.
 */
export async function startPayment(input: { orderId: string, token: string, providerAccountId?: string, origin: string }): Promise<StartResult> {
  const order = await basketFor(input.orderId, input.token)
  if (order.state !== 'awaiting_payment' || !order.intent_id) refuse('box-office.checkout.not-awaiting', 'This order is not waiting for a payment.', { status: 409 })
  const offers = (await methodsFor('online')).filter(m => !input.providerAccountId || m.providerAccountId === input.providerAccountId)
  if (!offers.length) refuse('box-office.checkout.no-method', 'Online payment is not set up here.', { status: 409 })
  return startAttempt(order.intent_id, { method: offers[0]!.method, providerAccountId: offers[0]!.providerAccountId, origin: input.origin })
}

/**
 * For a buyer who has just paid on the page, or come back from their bank: asks the provider now
 * whether the money arrived, rather than waiting for its webhook, then says where the basket stands.
 * Settling the payment confirms the order exactly as the webhook would.
 */
export async function checkPayment(orderId: string, token: string): Promise<BasketView> {
  const order = await basketFor(orderId, token)
  if (order.state === 'awaiting_payment' && order.intent_id) await refreshIntent(order.intent_id)
  return (await basketByToken(orderId, token))!
}
