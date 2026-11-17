// Exchanging tickets (BO-54; Box office specification, part 4, "Cancelling and exchanging"). One batch
// claims the new seats, marks the old lines exchanged, releases their seats, voids their tickets,
// adds the new lines and issues their tickets, so the buyer never loses the old seats without
// getting the new: if the new performance has just filled, nothing changes. Money: the price of the
// old tickets moves, still deferred, to the new performance; a cheaper exchange refunds the
// difference through Payments. A dearer exchange of paid tickets goes through the till: the new
// seats are held while the difference is taken, and the exchange is made when that payment settles.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { getPerformance, notify } from '#modules/core'
import { postEntries } from '#modules/finance'
import type { OwnerEntry, Part } from '#modules/payments'
import { spread, tagged, takenBack } from './cancel'
import { claimSeats, releaseHold } from './capacity'
import { cancellations, orderLines } from './db/schema'
import { liveLines, ORDER, wordsFor, type LineRow, type OrderRow } from './orders'
import { pricesFor } from './prices'
import { refundOrder, type OrderRefund } from './refunds'
import { poolsOf } from './setup'
import { issueTickets } from './tickets'

const DEFERRED = { key: 'box-office.deferred-ticket-income' }
const CHANGED = { code: 'box-office.order.lines-changed', reason: 'This booking has just changed.', remedy: 'Reload to see what is booked.' }
const TILL_HOLD = 30 * 60_000 // not-policy: as long as the till keeps a payment open; Payments ends the hold, not this time

export interface ExchangeTarget {
  /** The live lines to exchange. */
  lineIds: string[]
  /** Where they go: one performance, band and ticket type for all of them. */
  performanceId: string
  bandId: string
  ticketTypeId: string
}

export interface ExchangeInput extends ExchangeTarget {
  by: string
}

export interface Exchanged {
  orderId: string
  cancellationId: string
  totalMinor: number
  /** Null when nothing goes back. */
  refund: OrderRefund | null
  /** The new tickets' door codes, for a confirmed order. Handed out here and in the message, and kept nowhere. */
  doorCodes: string[]
}

/** What an exchange would cost or give back, before it is made. */
export async function exchangeQuote(orderId: string, input: ExchangeTarget): Promise<{ oldMinor: number, newMinor: number, differenceMinor: number, paid: boolean }> {
  const { order, chosen, priceMinor } = await check(orderId, input)
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = priceMinor * chosen.length
  return { oldMinor, newMinor, differenceMinor: newMinor - oldMinor, paid: order.state === 'confirmed' }
}

async function check(orderId: string, input: ExchangeTarget, options: { seatsHeld?: boolean } = {}) {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'reserved' && order.state !== 'confirmed')
    refuse('box-office.exchange.not-exchangeable', 'Only a reservation or a confirmed booking can be exchanged.', { status: 409 })
  const lines = await liveLines(order.id)
  const chosen = lines.filter(l => input.lineIds.includes(l.id))
  if (!chosen.length || chosen.length !== new Set(input.lineIds).size) refuse(CHANGED.code, 'Those tickets are not on this booking any more.', { status: 409, remedy: CHANGED.remedy })
  if (chosen.some(l => l.type_kind === 'companion' || l.type_kind === 'complimentary'))
    refuse('box-office.exchange.not-this-kind', 'Companion and complimentary tickets are not exchanged.', { status: 422, remedy: 'Cancel them and issue new ones.' })
  const at = nowMs()
  for (const performanceId of new Set(chosen.map(l => l.performance_id))) {
    if ((await getPerformance(performanceId)).startsAt <= at)
      refuse('box-office.exchange.too-late', 'A ticket for a performance that has started cannot be exchanged.', { status: 409 })
  }
  if (chosen.every(l => l.performance_id === input.performanceId && l.band_id === input.bandId && l.ticket_type_id === input.ticketTypeId))
    refuse('box-office.exchange.same', 'These tickets are already for that performance, seats and ticket type.', { status: 422 })
  const used = await first('SELECT 1 AS one FROM box_office_tickets WHERE state = \'valid\' AND admitted_at IS NOT NULL AND order_line_id IN (SELECT value FROM json_each(?))', JSON.stringify(chosen.map(l => l.id)))
  if (used) refuse('box-office.order.already-admitted', 'A ticket that has been used at the door cannot be exchanged.', { status: 409, remedy: 'Leave out the tickets that have been scanned in.' })

  const target = await getPerformance(input.performanceId)
  if (target.state !== 'scheduled' || target.startsAt <= at) refuse('box-office.exchange.target-closed', 'That performance cannot take bookings.', { status: 409 })
  const pool = (await poolsOf(input.performanceId)).find(p => p.bandId === input.bandId)
  if (!pool) refuse('box-office.exchange.bad-band', 'Those seats are not sold for that performance.', { status: 422, fields: { bandId: 'invalid' } })
  // Seats held for a payment were priced when they were held; the price is the exchange's own then.
  if (options.seatsHeld) return { order, chosen, pool, priceMinor: 0 }
  const price = (await pricesFor(input.performanceId, at)).find(p => p.bandId === input.bandId && p.ticketTypeId === input.ticketTypeId)
  if (!price) refuse('box-office.exchange.no-price', 'That ticket type has no price for those seats.', { status: 422, fields: { ticketTypeId: 'invalid' } })
  if (price.currency !== order.currency) refuse('box-office.exchange.currency', 'That performance is sold in another currency.', { status: 422 })
  return { order, chosen, pool, priceMinor: price.amountMinor }
}

/** Exchanges tickets at once: the same price or less, or any price on a reservation not yet paid for. */
export async function exchangeLines(unit: UnitView, orderId: string, input: ExchangeInput): Promise<Exchanged> {
  const { order, chosen, pool, priceMinor } = await check(orderId, input)
  const paid = order.state === 'confirmed'
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = priceMinor * chosen.length
  if (paid && newMinor > oldMinor) {
    refuse('box-office.exchange.costs-more', 'The new tickets cost more than the old ones, so the difference has to be paid first.', { status: 409, remedy: 'Take the difference at the till, which makes the exchange when it is paid.' })
  }
  const refundMinor = paid ? oldMinor - newMinor : 0

  const hold = await first<{ id: string }>('SELECT h.id FROM box_office_holds h JOIN box_office_claims c ON c.hold_id = h.id JOIN box_office_order_lines l ON l.claim_id = c.id WHERE l.id = ?', chosen[0]!.id)
  if (!hold) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })

  const refund = refundMinor > 0 ? await refundOrder(unit, order, refundMinor, input.by, 'Choose tickets at the same price.') : null
  // The new seats first: if the performance has just filled, the batch fails and nothing changes.
  const claimed = (await claimSeats(unit, { holdId: hold.id, requests: [{ poolId: pool.id, quantity: chosen.length }], state: 'confirmed', expiresAt: null })).flat()
  return makeExchange(unit, { order, chosen, claimed, input, priceMinor, refund, extraMinor: 0 })
}

/**
 * Makes the exchange once the new seats are confirmed: the old lines go, the new come with their
 * tickets, the order's total changes and the old price moves, still deferred, to the new
 * performance. What is paid on top (`extraMinor`) is credited by the payment that brought it.
 */
async function makeExchange(unit: UnitView, x: { order: OrderRow, chosen: LineRow[], claimed: string[], input: ExchangeInput, priceMinor: number, refund: OrderRefund | null, extraMinor: number }): Promise<Exchanged> {
  const { order, chosen, claimed, input, priceMinor, refund } = x
  const paid = order.state === 'confirmed'
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = priceMinor * chosen.length
  const totalMinor = order.total_minor - oldMinor + newMinor
  const at = nowMs()
  const ids = JSON.stringify(chosen.map(l => l.id))

  unit.add(sql`UPDATE box_office_order_lines SET state = 'exchanged', updated_at = ${at}
    WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(chosen.length, CHANGED)
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'exchanged'
    WHERE state = 'confirmed' AND id IN (SELECT claim_id FROM box_office_order_lines WHERE order_id = ${order.id} AND id IN (SELECT value FROM json_each(${ids})))`).expect(chosen.length, CHANGED)
  if (paid) {
    unit.add(sql`UPDATE box_office_tickets SET state = 'void', void_reason = 'exchanged', updated_at = ${at}
      WHERE state = 'valid' AND admitted_at IS NULL AND order_line_id IN (SELECT value FROM json_each(${ids}))`).expect(chosen.length, CHANGED)
  }
  const newIds = unit.insertSet(orderLines, chosen.map((old, i) => ({
    orderId: order.id, kind: 'ticket', performanceId: input.performanceId, bandId: input.bandId, ticketTypeId: input.ticketTypeId, claimId: claimed[i],
    listMinor: priceMinor, discountMinor: 0, amountMinor: priceMinor, replacesLineId: old.id, state: 'live',
  })))
  unit.expect(chosen.length)
  unit.add(sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = ${order.state} AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
  const [cancellationId] = unit.insertSet(cancellations, [{ orderId: order.id, kind: 'exchange', lineIds: ids, refundId: refund?.id ?? null, feeMinor: 0, by: input.by }])
  const doorCodes = paid ? await issueTickets(unit, newIds.map(id => ({ id, performance_id: input.performanceId }))) : []

  // What was paid and is not going back stays owed to the audience, now for the new performance.
  const carriedMinor = oldMinor - (refund?.amountMinor ?? 0)
  if (paid && carriedMinor > 0) {
    const back = spread(chosen, refund?.amountMinor ?? 0)
    const moving = new Map<string, number>()
    for (const line of chosen) moving.set(line.performance_id, (moving.get(line.performance_id) ?? 0) + line.amount_minor)
    for (const [performanceId, amount] of back) moving.set(performanceId, moving.get(performanceId)! - amount)
    await postEntries(unit, {
      key: `box-office:exchange:${cancellationId}`,
      source: { module: 'box-office', type: 'order', id: order.id },
      kind: 'transfer',
      currency: order.currency,
      postedBy: input.by,
      entries: [...await takenBack(moving), ...await tagged(DEFERRED, new Map([[input.performanceId, carriedMinor]]), -1)],
    })
  }

  unit.announce('box-office.order.exchanged', { orderId: order.id, cancellationId: cancellationId! }, { record: ['box-office.order', order.id] })
  if (order.account_id) {
    const typeName = (await first<{ name: string }>('SELECT name FROM box_office_ticket_types WHERE id = ?', input.ticketTypeId))?.name ?? ''
    const newLines = newIds.map(id => ({ id, performance_id: input.performanceId, band_id: input.bandId, ticket_type_id: input.ticketTypeId, amount_minor: priceMinor, type_name: typeName, type_kind: 'standard' }))
    const was = await wordsFor(order, chosen, oldMinor)
    const now = await wordsFor(order, newLines, refund?.amountMinor ?? x.extraMinor)
    await notify(unit, 'box-office.order-exchanged', {
      to: order.account_id,
      variables: {
        reference: order.reference,
        was: `${was.tickets} for ${was.show}, ${was.when}`,
        now: `${now.tickets} for ${now.show}, ${now.when}`,
        money: refund ? `A refund of ${now.amount} will go back the way you paid.` : x.extraMinor > 0 ? `You paid ${now.amount} more for these.` : 'There is nothing more to pay.',
        codes: paid ? doorCodes.join('\n\n') : 'You pay for these at the box office when you arrive, as before.',
      },
      subject: ['box-office.order', order.id],
    })
  }
  return { orderId: order.id, cancellationId: cancellationId!, totalMinor, refund, doorCodes }
}

// The till: an exchange to dearer tickets, made when the difference is paid.

interface ExchangeRow {
  id: string
  order_id: string
  line_ids: string
  performance_id: string
  band_id: string
  ticket_type_id: string
  price_minor: number
  difference_minor: number
  hold_id: string
  intent_id: string | null
  state: 'awaiting_payment' | 'completed' | 'released'
  by: string
}

const EXCHANGE = 'SELECT id, order_id, line_ids, performance_id, band_id, ticket_type_id, price_minor, difference_minor, hold_id, intent_id, state, by FROM box_office_exchanges'

export function isExchangeRecord(record: string): boolean {
  return record.startsWith('exch_')
}

/** The difference a dearer exchange of paid tickets costs, for the till to show. Reads only. */
export async function exchangeDifference(orderId: string, input: ExchangeTarget): Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }> {
  const quote = await exchangeQuote(orderId, input)
  if (!quote.paid) refuse('box-office.exchange.not-paid', 'This booking has not been paid for, so it is exchanged from its own page.', { status: 409 })
  if (quote.differenceMinor <= 0) refuse('box-office.exchange.nothing-to-pay', 'These tickets cost no more, so there is no difference to take.', { status: 409, remedy: 'Exchange them from the booking\'s page.' })
  const type = await first<{ name: string }>('SELECT name FROM box_office_ticket_types WHERE id = ?', input.ticketTypeId)
  return { lines: [{ label: type?.name ?? '', amountMinor: quote.differenceMinor }], amountMinor: quote.differenceMinor }
}

/**
 * Holds the new seats for a dearer exchange and records what is to be paid, in the batch that makes
 * the till's payment. The difference must be what the seller was shown.
 */
export async function prepareExchange(unit: UnitView, orderId: string, input: ExchangeTarget & { expectedDifferenceMinor: number }, by: string): Promise<{ exchangeId: string, differenceMinor: number }> {
  const { order, chosen, pool, priceMinor } = await check(orderId, input)
  if (order.state !== 'confirmed') refuse('box-office.exchange.not-paid', 'This booking has not been paid for, so it is exchanged from its own page.', { status: 409 })
  const differenceMinor = priceMinor * chosen.length - chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  if (differenceMinor <= 0) refuse('box-office.exchange.nothing-to-pay', 'These tickets cost no more, so there is no difference to take.', { status: 409, remedy: 'Exchange them from the booking\'s page.' })
  if (differenceMinor !== input.expectedDifferenceMinor)
    refuse('box-office.exchange.price-changed', 'The difference to pay has changed.', { status: 409, remedy: 'Choose the tickets again to see what is due.' })
  const at = nowMs()
  const holdId = newId('hold')
  const exchangeId = newId('exch')
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'payment', ${order.id}, ${by}, ${at}, ${at})`)
  await claimSeats(unit, { holdId, requests: [{ poolId: pool.id, quantity: chosen.length }], expiresAt: at + TILL_HOLD })
  unit.add(sql`INSERT INTO box_office_exchanges (id, order_id, line_ids, performance_id, band_id, ticket_type_id, price_minor, difference_minor, hold_id, state, by, created_at, updated_at)
    VALUES (${exchangeId}, ${order.id}, ${JSON.stringify(chosen.map(l => l.id))}, ${input.performanceId}, ${input.bandId}, ${input.ticketTypeId}, ${priceMinor}, ${differenceMinor}, ${holdId}, 'awaiting_payment', ${by}, ${at}, ${at})`)
  return { exchangeId, differenceMinor }
}

/** Puts the till's payment on the exchange just prepared. */
export function attachExchange(unit: UnitView, exchangeId: string, intentId: string): void {
  unit.add(sql`UPDATE box_office_exchanges SET intent_id = ${intentId} WHERE id = ${exchangeId} AND state = 'awaiting_payment' AND intent_id IS NULL`).expect(1, CHANGED)
}

/** The difference has been paid: make the exchange in Payments' batch, and credit what was paid on top. */
export async function settleExchange(unit: UnitView, part: Part): Promise<OwnerEntry[]> {
  const exchange = await first<ExchangeRow>(`${EXCHANGE} WHERE id = ?`, part.record)
  if (!exchange || exchange.state !== 'awaiting_payment' || exchange.intent_id !== part.intentId || exchange.difference_minor !== part.amountMinor)
    throw new Error(`Exchange ${part.record} is not waiting for payment part ${part.id}`)
  const input: ExchangeInput = { lineIds: JSON.parse(exchange.line_ids) as string[], performanceId: exchange.performance_id, bandId: exchange.band_id, ticketTypeId: exchange.ticket_type_id, by: exchange.by }
  const { order, chosen } = await check(exchange.order_id, input, { seatsHeld: true })
  if (order.state !== 'confirmed') refuse('box-office.exchange.not-paid', 'This booking is no longer confirmed.', { status: 409 })
  const claimed = (await all<{ id: string }>('SELECT id FROM box_office_claims WHERE hold_id = ? AND state = \'held\' ORDER BY id', exchange.hold_id)).map(c => c.id)
  if (claimed.length !== chosen.length) refuse(CHANGED.code, 'The seats held for this exchange have gone.', { status: 409, remedy: CHANGED.remedy })
  const at = nowMs()
  unit.add(sql`UPDATE box_office_claims SET state = 'confirmed', expires_at = NULL WHERE hold_id = ${exchange.hold_id} AND state = 'held'`).expect(claimed.length, CHANGED)
  const made = await makeExchange(unit, { order, chosen, claimed, input, priceMinor: exchange.price_minor, refund: null, extraMinor: exchange.difference_minor })
  unit.add(sql`UPDATE box_office_exchanges SET state = 'completed', cancellation_id = ${made.cancellationId}, updated_at = ${at} WHERE id = ${exchange.id} AND state = 'awaiting_payment'`).expect(1, CHANGED)
  return tagged(DEFERRED, new Map([[exchange.performance_id, exchange.difference_minor]]), -1)
}

/** The payment ended without the money: the held seats go back on sale and the booking stays as it was. */
export async function releaseExchange(unit: UnitView, part: Part): Promise<void> {
  const exchange = await first<ExchangeRow>(`${EXCHANGE} WHERE id = ?`, part.record)
  if (!exchange || exchange.state !== 'awaiting_payment' || exchange.intent_id !== part.intentId) return
  releaseHold(unit, exchange.hold_id, 'payment_failed')
  unit.add(sql`UPDATE box_office_exchanges SET state = 'released', updated_at = ${nowMs()} WHERE id = ${exchange.id} AND state = 'awaiting_payment'`)
}

/** The order an exchange's payment belongs to, for a refund of that payment. */
export async function exchangeOrder(exchangeId: string): Promise<string> {
  const row = await first<{ order_id: string }>('SELECT order_id FROM box_office_exchanges WHERE id = ?', exchangeId)
  if (!row) throw new Error(`No exchange ${exchangeId}`)
  return row.order_id
}
