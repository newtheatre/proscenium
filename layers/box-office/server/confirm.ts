// Confirming an order (Box office specification, part 3, "An order"): one batch makes the sale
// real. The order becomes confirmed, every seat it claims is confirmed with no expiry, a ticket is
// issued for each ticket line, the event is announced and the buyer is sent their tickets. It runs
// when the payment settles, through the settlement handler, and at once for an order with nothing
// to pay. A reservation paid at the desk arrives with its claims already confirmed: they are
// asserted, not changed.
import { sql } from 'drizzle-orm'
import { nowMs, type UnitView } from '#kit'
import { claimLink, notify } from '#modules/core'
import { hashOf, randomToken } from './codes'
import { siteUrl } from './links'
import { RAN_OUT, wordsFor, type LineRow, type OrderRow } from './orders'
import { issueTickets } from './tickets'

export interface Confirmed {
  state: 'confirmed'
  orderId: string
  reference: string
  currency: string
  totalMinor: number
  /** The door codes, one for each ticket line in order. Handed out here and in the message, and kept nowhere. */
  doorCodes: string[]
  /** The message carries the link that opens the buyer's account, so the page may say so. */
  accountLinkSent: boolean
}

export interface ConfirmOptions {
  /** The state the order must be leaving. */
  from: 'basket' | 'awaiting_payment'
  /** The payment that settled, which must be the one the order is waiting for. */
  intentId?: string
  /** Who the order is for, when confirming is also when that is first known (a free order). */
  account?: { id: string, signedIn: boolean, madeWith?: { address: string } | null }
  /** Whether a message can link to the site: false where no request is at hand to take the address from. */
  link?: boolean
}

const GONE = { code: 'box-office.order.gone', reason: 'This order is no longer waiting to be confirmed.', remedy: 'Start the booking again.' }

export async function confirmOrder(unit: UnitView, order: OrderRow, lines: LineRow[], options: ConfirmOptions): Promise<Confirmed> {
  const at = nowMs()
  const accountId = options.account?.id ?? order.account_id
  // The link in the message replaces any earlier one, so a reservation's link gives way to the tickets'.
  const token = randomToken()
  const leaving = options.from === 'basket'
    ? sql`state = 'basket' AND expires_at > ${at}`
    : sql`state = 'awaiting_payment' AND intent_id = ${options.intentId ?? null}`
  unit.add(sql`UPDATE box_office_orders SET account_id = ${accountId}, signed_in = ${options.account ? options.account.signedIn : sql`signed_in`}, state = 'confirmed',
      confirmed_at = ${at}, expires_at = NULL, release_at = NULL, link_token_hash = ${await hashOf(token)}, updated_at = ${at},
      confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_email = NULL, confirm_name = NULL
    WHERE id = ${order.id} AND total_minor = ${order.total_minor} AND ${leaving}`)
    .expect(1, options.from === 'basket' ? RAN_OUT : GONE)
  // Every seat is still this order's: held until now, or confirmed already by a reservation.
  unit.add(sql`UPDATE box_office_claims SET state = 'confirmed', expires_at = NULL
    WHERE state IN ('held', 'confirmed') AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${order.id})`)
    .expect(lines.length, options.from === 'basket' ? RAN_OUT : GONE)

  // Paid at the desk with the buyer standing there: admitted in the same batch, by whoever sold it.
  const doorCodes = await issueTickets(unit, lines, options.from === 'awaiting_payment' && order.admit_on_payment && order.sold_by ? { by: order.sold_by, at } : undefined)
  const performanceIds = [...new Set(lines.map(l => l.performance_id))]
  unit.announce('box-office.order.confirmed', { orderId: order.id, performanceIds }, { record: ['box-office.order', order.id] })
  // An anonymous desk sale has nobody to write to: the seller hands over the tickets, or sends them afterwards.
  const accountLinkSent = accountId ? await sendTickets(unit, order, lines, { accountId, doorCodes, token, dedupeKey: `confirmed:${order.id}`, madeWith: options.account?.madeWith }) : false
  return { state: 'confirmed', orderId: order.id, reference: order.reference, currency: order.currency, totalMinor: order.total_minor, doorCodes, accountLinkSent }
}

/** Sends the buyer their tickets: the door codes and the link to the booking, whose token is `token`. */
export async function sendTickets(unit: UnitView, order: Pick<OrderRow, 'id' | 'reference' | 'currency' | 'total_minor'>, lines: LineRow[], send: { accountId: string, doorCodes: string[], token: string, dedupeKey: string, madeWith?: Parameters<typeof claimLink>[2] }): Promise<boolean> {
  const words = await wordsFor(order, lines, order.total_minor)
  const variables = { reference: order.reference, show: words.show, when: words.when, tickets: words.ticketsWithAge, paid: order.total_minor === 0 ? 'Free' : words.amount, codes: send.doorCodes.join('\n\n'), link: await siteUrl(`/book/order/${send.token}`) }
  // A buyer who has never signed in also gets the link that opens their account (core's claim link).
  const account = await claimLink(unit, send.accountId, send.madeWith)
  await notify(unit, account ? 'box-office.order-confirmed-guest' : 'box-office.order-confirmed', {
    to: send.accountId,
    variables: account ? { ...variables, account } : variables,
    subject: ['box-office.order', order.id],
    dedupeKey: send.dedupeKey,
  })
  return !!account
}
