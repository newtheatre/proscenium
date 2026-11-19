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
import { RAN_OUT, visitFor, wordsFor, type LineRow, type OrderRow } from './orders'
import { applyHeldCovers } from './pass-covers'
import { sendNewPasses, settlePassSales } from './pass-sales'
import { doorCodesForOrder, issueTickets, ticketNumbers } from './tickets'

export interface Confirmed {
  state: 'confirmed'
  orderId: string
  reference: string
  currency: string
  totalMinor: number
  /** The door codes, one for each ticket line in order. Handed out here; the message links to the page that shows them. */
  doorCodes: string[]
  /** The message carries the link that opens the buyer's account, so the page may say so. */
  accountLinkSent: boolean
  /** Opens the booking's page (the link in the message), so the screen can show the tickets at once. Never stored. */
  token: string
}

export interface ConfirmOptions {
  /** The state the order must be leaving: `reserved` only when a pass has covered all it owed. */
  from: 'basket' | 'awaiting_payment' | 'reserved'
  /** The payment that settled, which must be the one the order is waiting for. */
  intentId?: string
  /** Who the order is for, when confirming is also when that is first known (a free order). */
  account?: { id: string, signedIn: boolean, madeWith?: { address: string } | null, /** The address typed when booking signed out, which the tickets go to. */ address?: string | null }
  /** Whether a message can link to the site: false where no request is at hand to take the address from. */
  link?: boolean
  /** Issued at the desk with nothing to pay and the buyer standing there: admitted by this seller. */
  admitBy?: string
  /** Who holds each new pass on the order, by pass, where that is not the buyer: whoever paid for it in a split sale. */
  passHolders?: ReadonlyMap<string, string>
}

const GONE = { code: 'box-office.order.gone', reason: 'This order is no longer waiting to be confirmed.', remedy: 'Start the booking again.' }

export async function confirmOrder(unit: UnitView, order: OrderRow, lines: LineRow[], options: ConfirmOptions): Promise<Confirmed> {
  const at = nowMs()
  const accountId = options.account?.id ?? order.account_id
  // The link in the message replaces any earlier one, so a reservation's link gives way to the tickets'.
  const token = randomToken()
  const leaving = options.from === 'basket'
    ? sql`state = 'basket' AND expires_at > ${at}`
    : options.from === 'reserved'
      ? sql`state = 'reserved'`
      : sql`state = 'awaiting_payment' AND intent_id = ${options.intentId ?? null}`
  unit.add(sql`UPDATE box_office_orders SET account_id = ${accountId}, signed_in = ${options.account ? options.account.signedIn : sql`signed_in`}, state = 'confirmed',
      confirmed_at = ${at}, expires_at = NULL, release_at = NULL, link_token_hash = ${await hashOf(token)}, updated_at = ${at},
      confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_email = NULL, confirm_name = NULL
    WHERE id = ${order.id} AND total_minor = ${order.total_minor} AND ${leaving}`)
    .expect(1, options.from === 'basket' ? RAN_OUT : GONE)
  // Every seat is still this order's: held until now, or confirmed already by a reservation.
  unit.add(sql`UPDATE box_office_claims SET state = 'confirmed', expires_at = NULL
    WHERE state IN ('held', 'confirmed') AND displaced_for_id IS NULL AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${order.id})`)
    .expect(lines.length, options.from === 'basket' ? RAN_OUT : GONE)

  // Its passes are the buyer's and paid for: those bought with it, and any earlier one collected here.
  await sendNewPasses(unit, order, accountId, true, options.passHolders)
  settlePassSales(unit, order.id, accountId, true, at, options.passHolders)
  // Tickets the buyer already had, asked to be covered by a pass bought here, become its entries now.
  if (options.from !== 'reserved') await applyHeldCovers(unit, order.id, accountId, at)

  // Paid at the desk with the buyer standing there: admitted in the same batch, by whoever sold it.
  const doorCodes = await issueTickets(unit, lines, options.admitBy ? { by: options.admitBy, at } : options.from === 'awaiting_payment' && order.admit_on_payment && order.sold_by ? { by: order.sold_by, at } : undefined)
  const performanceIds = [...new Set(lines.map(l => l.performance_id))]
  unit.announce('box-office.order.confirmed', { orderId: order.id, performanceIds }, { record: ['box-office.order', order.id] })
  // An anonymous desk sale has nobody to write to: the seller hands over the tickets, or sends them afterwards.
  // A pass sold on its own has no tickets: its own message has gone.
  // Booked signed out: the tickets go to the address typed, not the account's usual one (Matt, 19 November).
  const address = options.account ? (options.account.signedIn ? null : options.account.address ?? null) : order.booked_with
  const accountLinkSent = accountId && lines.length ? await sendTickets(unit, order, lines, { accountId, token, dedupeKey: `confirmed:${order.id}`, madeWith: options.account?.madeWith, doorCodes, address }) : false
  return { state: 'confirmed', orderId: order.id, reference: order.reference, currency: order.currency, totalMinor: order.total_minor, doorCodes, accountLinkSent, token }
}

export interface SendTickets {
  accountId: string
  token: string
  dedupeKey: string
  madeWith?: Parameters<typeof claimLink>[2]
  /** The codes of tickets issued in this unit, one for each line; read from the order when left out. */
  doorCodes?: readonly string[]
  /** The address to write to this time, over the account's usual one. */
  address?: string | null
}

/** Sends the buyer their tickets: the ticket numbers, each ticket's code as a QR code, and the link to the booking, whose token is `token`. */
export async function sendTickets(unit: UnitView, order: Pick<OrderRow, 'id' | 'reference' | 'currency' | 'total_minor'>, lines: LineRow[], send: SendTickets): Promise<boolean> {
  const words = await wordsFor(order, lines, order.total_minor)
  const numbers = await ticketNumbers(order, lines.map(l => l.id))
  const kept = send.doorCodes ? null : new Map((await doorCodesForOrder(order.id)).map(t => [t.lineId, t.doorCode]))
  const codes = lines.map((l, i) => ({ number: numbers[i]!, code: send.doorCodes ? send.doorCodes[i] : kept!.get(l.id) })).filter(c => !!c.code)
  // A caption and a code on each line, as core's QR drawing takes them; a space where no code is kept, which draws nothing.
  const drawn = codes.map((c, i) => `Ticket ${i + 1} of ${codes.length}, number ${c.number}\t${c.code}`).join('\n') || ' '
  const variables = { reference: order.reference, show: words.show, when: words.when, ...await visitFor(lines), tickets: words.ticketsWithAge, paid: order.total_minor === 0 ? 'Free' : words.amount, numbers: numbers.join(', '), codes: drawn, link: await siteUrl(`/book/order/${send.token}`) }
  // A buyer who has never signed in also gets the link that opens their account (core's claim link).
  const account = await claimLink(unit, send.accountId, send.madeWith)
  await notify(unit, account ? 'box-office.order-confirmed-guest' : 'box-office.order-confirmed', {
    to: [{ accountId: send.accountId, ...send.address ? { address: send.address } : {} }],
    variables: account ? { ...variables, account } : variables,
    subject: ['box-office.order', order.id],
    dedupeKey: send.dedupeKey,
  })
  return !!account
}
