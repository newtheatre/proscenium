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
  /** Where they go: one performance for all of them. */
  performanceId: string
  /** The live lines to exchange, each with its own seats and ticket type, so 2 adults and a child stay that. */
  lines: { lineId: string, bandId: string, ticketTypeId: string }[]
}

/** One line's new seats, ticket type and price. */
interface Move { line: LineRow, bandId: string, ticketTypeId: string, poolId: string, priceMinor: number }

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
  const { order, chosen, moves } = await check(orderId, input)
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = moves.reduce((sum, m) => sum + m.priceMinor, 0)
  return { oldMinor, newMinor, differenceMinor: newMinor - oldMinor, paid: order.state === 'confirmed' }
}

async function check(orderId: string, input: ExchangeTarget, options: { heldPrices?: Map<string, number> } = {}) {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'reserved' && order.state !== 'confirmed')
    refuse('box-office.exchange.not-exchangeable', 'Only a reservation or a confirmed booking can be exchanged.', { status: 409 })
  const lines = await liveLines(order.id)
  const wanted = new Map(input.lines.map(l => [l.lineId, l]))
  const chosen = lines.filter(l => wanted.has(l.id))
  if (!chosen.length || chosen.length !== wanted.size || wanted.size !== input.lines.length) refuse(CHANGED.code, 'Those tickets are not on this booking any more.', { status: 409, remedy: CHANGED.remedy })
  if (chosen.some(l => l.type_kind === 'companion' || l.type_kind === 'complimentary'))
    refuse('box-office.exchange.not-this-kind', 'Companion and complimentary tickets are not exchanged.', { status: 422, remedy: 'Cancel them and issue new ones.' })
  const at = nowMs()
  for (const performanceId of new Set(chosen.map(l => l.performance_id))) {
    if ((await getPerformance(performanceId)).startsAt <= at)
      refuse('box-office.exchange.too-late', 'A ticket for a performance that has started cannot be exchanged.', { status: 409 })
  }
  if (chosen.every(l => l.performance_id === input.performanceId && l.band_id === wanted.get(l.id)!.bandId && l.ticket_type_id === wanted.get(l.id)!.ticketTypeId))
    refuse('box-office.exchange.same', 'These tickets are already for that performance, seats and ticket type.', { status: 422 })
  const used = await first('SELECT 1 AS one FROM box_office_tickets WHERE state = \'valid\' AND admitted_at IS NOT NULL AND order_line_id IN (SELECT value FROM json_each(?))', JSON.stringify(chosen.map(l => l.id)))
  if (used) refuse('box-office.order.already-admitted', 'A ticket that has been used at the door cannot be exchanged.', { status: 409, remedy: 'Leave out the tickets that have been scanned in.' })

  const target = await getPerformance(input.performanceId)
  if (target.state !== 'scheduled' || target.startsAt <= at) refuse('box-office.exchange.target-closed', 'That performance cannot take bookings.', { status: 409 })
  const pools = await poolsOf(input.performanceId)
  // Seats held for a payment were priced when they were held; the prices are the exchange's own then.
  const prices = options.heldPrices ? null : await pricesFor(input.performanceId, at)
  const moves: Move[] = chosen.map((line) => {
    const { bandId, ticketTypeId } = wanted.get(line.id)!
    const pool = pools.find(p => p.bandId === bandId)
    if (!pool) refuse('box-office.exchange.bad-band', 'Those seats are not sold for that performance.', { status: 422, fields: { bandId: 'invalid' } })
    if (!prices) return { line, bandId, ticketTypeId, poolId: pool.id, priceMinor: options.heldPrices!.get(line.id) ?? 0 }
    const price = prices.find(p => p.bandId === bandId && p.ticketTypeId === ticketTypeId)
    if (!price) refuse('box-office.exchange.no-price', 'That ticket type has no price for those seats.', { status: 422, fields: { ticketTypeId: 'invalid' } })
    if (price.currency !== order.currency) refuse('box-office.exchange.currency', 'That performance is sold in another currency.', { status: 422 })
    return { line, bandId, ticketTypeId, poolId: pool.id, priceMinor: price.amountMinor }
  })
  return { order, chosen, moves }
}

/** How many seats each pool gives, for one claim per pool. */
function requestsFor(moves: Move[]): { poolId: string, quantity: number }[] {
  const counts = new Map<string, number>()
  for (const m of moves) counts.set(m.poolId, (counts.get(m.poolId) ?? 0) + 1)
  return [...counts].map(([poolId, quantity]) => ({ poolId, quantity }))
}

/** Hands each move a claim from its own pool, in the order the claims were made. */
function claimsFor(moves: Move[], byPool: Map<string, string[]>): string[] {
  const left = new Map([...byPool].map(([pool, ids]) => [pool, [...ids]]))
  return moves.map((m) => {
    const id = left.get(m.poolId)?.shift()
    if (!id) refuse(CHANGED.code, 'The seats for this exchange have gone.', { status: 409, remedy: CHANGED.remedy })
    return id
  })
}

/** Exchanges tickets at once: the same price or less, or any price on a reservation not yet paid for. */
export async function exchangeLines(unit: UnitView, orderId: string, input: ExchangeInput): Promise<Exchanged> {
  const { order, chosen, moves } = await check(orderId, input)
  const paid = order.state === 'confirmed'
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = moves.reduce((sum, m) => sum + m.priceMinor, 0)
  if (paid && newMinor > oldMinor) {
    refuse('box-office.exchange.costs-more', 'The new tickets cost more than the old ones, so the difference has to be paid first.', { status: 409, remedy: 'Take the difference at the till, which makes the exchange when it is paid.' })
  }
  const refundMinor = paid ? oldMinor - newMinor : 0

  const hold = await first<{ id: string }>('SELECT h.id FROM box_office_holds h JOIN box_office_claims c ON c.hold_id = h.id JOIN box_office_order_lines l ON l.claim_id = c.id WHERE l.id = ?', chosen[0]!.id)
  if (!hold) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })

  const refund = refundMinor > 0 ? await refundOrder(unit, order, refundMinor, input.by, 'Choose tickets at the same price.') : null
  // The new seats first: if the performance has just filled, the batch fails and nothing changes.
  const requests = requestsFor(moves)
  const claims = await claimSeats(unit, { holdId: hold.id, requests, state: 'confirmed', expiresAt: null })
  const claimed = claimsFor(moves, new Map(requests.map((r, i) => [r.poolId, claims[i]!])))
  return makeExchange(unit, { order, chosen, moves, claimed, input, refund, extraMinor: 0 })
}

/**
 * Makes the exchange once the new seats are confirmed: the old lines go, the new come with their
 * tickets, the order's total changes and the old price moves, still deferred, to the new
 * performance. What is paid on top (`extraMinor`) is credited by the payment that brought it.
 */
async function makeExchange(unit: UnitView, x: { order: OrderRow, chosen: LineRow[], moves: Move[], claimed: string[], input: ExchangeInput, refund: OrderRefund | null, extraMinor: number }): Promise<Exchanged> {
  const { order, chosen, moves, claimed, input, refund } = x
  const paid = order.state === 'confirmed'
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = moves.reduce((sum, m) => sum + m.priceMinor, 0)
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
  const newIds = unit.insertSet(orderLines, moves.map((m, i) => ({
    orderId: order.id, kind: 'ticket', performanceId: input.performanceId, bandId: m.bandId, ticketTypeId: m.ticketTypeId, claimId: claimed[i],
    listMinor: m.priceMinor, discountMinor: 0, amountMinor: m.priceMinor, replacesLineId: m.line.id, state: 'live',
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
    const names = await typeNames(moves.map(m => m.ticketTypeId))
    const newLines = newIds.map((id, i) => ({ id, performance_id: input.performanceId, band_id: moves[i]!.bandId, ticket_type_id: moves[i]!.ticketTypeId, amount_minor: moves[i]!.priceMinor, type_name: names.get(moves[i]!.ticketTypeId) ?? '', type_kind: 'standard' }))
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

async function typeNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await all<{ id: string, name: string }>('SELECT id, name FROM box_office_ticket_types WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify([...new Set(ids)]))
  return new Map(rows.map(r => [r.id, r.name]))
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
  /** Each line's own seats, ticket type and price; null on an exchange made before lines could differ. */
  moves: string | null
  difference_minor: number
  hold_id: string
  intent_id: string | null
  state: 'awaiting_payment' | 'completed' | 'released'
  by: string
}

const EXCHANGE = 'SELECT id, order_id, line_ids, performance_id, band_id, ticket_type_id, price_minor, moves, difference_minor, hold_id, intent_id, state, by FROM box_office_exchanges'

export function isExchangeRecord(record: string): boolean {
  return record.startsWith('exch_')
}

/** The difference a dearer exchange of paid tickets costs, for the till to show. Reads only. */
export async function exchangeDifference(orderId: string, input: ExchangeTarget): Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }> {
  const quote = await exchangeQuote(orderId, input)
  if (!quote.paid) refuse('box-office.exchange.not-paid', 'This booking has not been paid for, so it is exchanged from its own page.', { status: 409 })
  if (quote.differenceMinor <= 0) refuse('box-office.exchange.nothing-to-pay', 'These tickets cost no more, so there is no difference to take.', { status: 409, remedy: 'Exchange them from the booking\'s page.' })
  const names = await typeNames(input.lines.map(l => l.ticketTypeId))
  return { lines: [{ label: [...names.values()].join(', '), amountMinor: quote.differenceMinor }], amountMinor: quote.differenceMinor }
}

/**
 * Holds the new seats for a dearer exchange and records what is to be paid, in the batch that makes
 * the till's payment. The difference must be what the seller was shown.
 */
export async function prepareExchange(unit: UnitView, orderId: string, input: ExchangeTarget & { expectedDifferenceMinor: number }, by: string): Promise<{ exchangeId: string, differenceMinor: number }> {
  const { order, chosen, moves } = await check(orderId, input)
  if (order.state !== 'confirmed') refuse('box-office.exchange.not-paid', 'This booking has not been paid for, so it is exchanged from its own page.', { status: 409 })
  const differenceMinor = moves.reduce((sum, m) => sum + m.priceMinor, 0) - chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  if (differenceMinor <= 0) refuse('box-office.exchange.nothing-to-pay', 'These tickets cost no more, so there is no difference to take.', { status: 409, remedy: 'Exchange them from the booking\'s page.' })
  if (differenceMinor !== input.expectedDifferenceMinor)
    refuse('box-office.exchange.price-changed', 'The difference to pay has changed.', { status: 409, remedy: 'Choose the tickets again to see what is due.' })
  const at = nowMs()
  const holdId = newId('hold')
  const exchangeId = newId('exch')
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'payment', ${order.id}, ${by}, ${at}, ${at})`)
  await claimSeats(unit, { holdId, requests: requestsFor(moves), expiresAt: at + TILL_HOLD })
  // band_id, ticket_type_id and price_minor keep the first line's, for an exchange read before moves were kept.
  const kept = JSON.stringify(moves.map(m => ({ lineId: m.line.id, bandId: m.bandId, ticketTypeId: m.ticketTypeId, priceMinor: m.priceMinor })))
  unit.add(sql`INSERT INTO box_office_exchanges (id, order_id, line_ids, performance_id, band_id, ticket_type_id, price_minor, moves, difference_minor, hold_id, state, by, created_at, updated_at)
    VALUES (${exchangeId}, ${order.id}, ${JSON.stringify(chosen.map(l => l.id))}, ${input.performanceId}, ${moves[0]!.bandId}, ${moves[0]!.ticketTypeId}, ${moves[0]!.priceMinor}, ${kept}, ${differenceMinor}, ${holdId}, 'awaiting_payment', ${by}, ${at}, ${at})`)
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
  const kept = movesOf(exchange)
  const input: ExchangeInput = { performanceId: exchange.performance_id, lines: kept.map(({ lineId, bandId, ticketTypeId }) => ({ lineId, bandId, ticketTypeId })), by: exchange.by }
  const { order, chosen, moves } = await check(exchange.order_id, input, { heldPrices: new Map(kept.map(m => [m.lineId, m.priceMinor])) })
  if (order.state !== 'confirmed') refuse('box-office.exchange.not-paid', 'This booking is no longer confirmed.', { status: 409 })
  const held = await all<{ id: string, pool_id: string }>('SELECT id, pool_id FROM box_office_claims WHERE hold_id = ? AND state = \'held\' ORDER BY id', exchange.hold_id)
  if (held.length !== chosen.length) refuse(CHANGED.code, 'The seats held for this exchange have gone.', { status: 409, remedy: CHANGED.remedy })
  const byPool = new Map<string, string[]>()
  for (const c of held) byPool.set(c.pool_id, [...byPool.get(c.pool_id) ?? [], c.id])
  const claimed = claimsFor(moves, byPool)
  const at = nowMs()
  unit.add(sql`UPDATE box_office_claims SET state = 'confirmed', expires_at = NULL WHERE hold_id = ${exchange.hold_id} AND state = 'held'`).expect(held.length, CHANGED)
  const made = await makeExchange(unit, { order, chosen, moves, claimed, input, refund: null, extraMinor: exchange.difference_minor })
  unit.add(sql`UPDATE box_office_exchanges SET state = 'completed', cancellation_id = ${made.cancellationId}, updated_at = ${at} WHERE id = ${exchange.id} AND state = 'awaiting_payment'`).expect(1, CHANGED)
  return tagged(DEFERRED, new Map([[exchange.performance_id, exchange.difference_minor]]), -1)
}

/** Each line's new seats, ticket type and price; an exchange kept before lines could differ gives every line the same. */
function movesOf(exchange: ExchangeRow): { lineId: string, bandId: string, ticketTypeId: string, priceMinor: number }[] {
  if (exchange.moves) return JSON.parse(exchange.moves) as { lineId: string, bandId: string, ticketTypeId: string, priceMinor: number }[]
  return (JSON.parse(exchange.line_ids) as string[]).map(lineId => ({ lineId, bandId: exchange.band_id, ticketTypeId: exchange.ticket_type_id, priceMinor: exchange.price_minor }))
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
