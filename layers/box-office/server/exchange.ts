// Exchanging tickets (BO-54; Box office specification, part 4, "Cancelling and exchanging"). One batch
// claims the new seats, marks the old lines exchanged, releases their seats, voids their tickets,
// adds the new lines and issues their tickets, so the buyer never loses the old seats without
// getting the new: if the new performance has just filled, nothing changes. Money: the price of the
// old tickets moves, still deferred, to the new performance; a cheaper exchange refunds the
// difference through Payments; one that costs more is not done here yet (sell the difference at
// the desk instead).
import { sql } from 'drizzle-orm'
import { first, nowMs, refuse, type UnitView } from '#kit'
import { getPerformance, notify } from '#modules/core'
import { postEntries } from '#modules/finance'
import { intentStatus, requestRefund } from '#modules/payments'
import { spread, tagged, takenBack } from './cancel'
import { claimSeats } from './capacity'
import { cancellations, orderLines } from './db/schema'
import { liveLines, ORDER, wordsFor, type OrderRow } from './orders'
import { pricesFor } from './prices'
import { poolsOf } from './setup'
import { issueTickets } from './tickets'

const DEFERRED = { key: 'box-office.deferred-ticket-income' }
const CHANGED = { code: 'box-office.order.lines-changed', reason: 'This booking has just changed.', remedy: 'Reload to see what is booked.' }

export interface ExchangeInput {
  /** The live lines to exchange. */
  lineIds: string[]
  /** Where they go: one performance, band and ticket type for all of them. */
  performanceId: string
  bandId: string
  ticketTypeId: string
  by: string
}

export interface Exchanged {
  orderId: string
  cancellationId: string
  totalMinor: number
  /** Null when nothing goes back. */
  refund: { id: string, state: 'requested' | 'approved', amountMinor: number } | null
  /** The new tickets' door codes, for a confirmed order. Handed out here and in the message, and kept nowhere. */
  doorCodes: string[]
}

/** What an exchange would cost or give back, before it is made. */
export async function exchangeQuote(orderId: string, input: Omit<ExchangeInput, 'by'>): Promise<{ oldMinor: number, newMinor: number, differenceMinor: number }> {
  const { chosen, priceMinor } = await check(orderId, input)
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = priceMinor * chosen.length
  return { oldMinor, newMinor, differenceMinor: newMinor - oldMinor }
}

async function check(orderId: string, input: Omit<ExchangeInput, 'by'>) {
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
  const price = (await pricesFor(input.performanceId, at)).find(p => p.bandId === input.bandId && p.ticketTypeId === input.ticketTypeId)
  if (!price) refuse('box-office.exchange.no-price', 'That ticket type has no price for those seats.', { status: 422, fields: { ticketTypeId: 'invalid' } })
  if (price.currency !== order.currency) refuse('box-office.exchange.currency', 'That performance is sold in another currency.', { status: 422 })
  return { order, chosen, pool, priceMinor: price.amountMinor }
}

export async function exchangeLines(unit: UnitView, orderId: string, input: ExchangeInput): Promise<Exchanged> {
  const { order, chosen, pool, priceMinor } = await check(orderId, input)
  const paid = order.state === 'confirmed'
  const oldMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const newMinor = priceMinor * chosen.length
  if (paid && newMinor > oldMinor) {
    refuse('box-office.exchange.costs-more', 'The new tickets cost more than the old ones, and collecting the difference is not done here yet.', { status: 409, remedy: 'Choose tickets at the same price or less, or cancel these and sell the new ones at the desk.' })
  }
  const refundMinor = paid ? oldMinor - newMinor : 0
  const totalMinor = order.total_minor - oldMinor + newMinor
  const at = nowMs()
  const ids = JSON.stringify(chosen.map(l => l.id))

  const hold = await first<{ id: string }>('SELECT h.id FROM box_office_holds h JOIN box_office_claims c ON c.hold_id = h.id JOIN box_office_order_lines l ON l.claim_id = c.id WHERE l.id = ?', chosen[0]!.id)
  if (!hold) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })

  let refund: Exchanged['refund'] = null
  if (refundMinor > 0) {
    const part = order.intent_id ? (await intentStatus(order.intent_id))?.parts.find(p => p.owner.module === 'box-office' && p.owner.record === orderId) : undefined
    if (!part) refuse('box-office.order.nothing-paid', 'No payment is recorded for this booking, so the difference cannot be refunded.', { status: 409, remedy: 'Choose tickets at the same price.' })
    const asked = await requestRefund(unit, { partId: part.id, amountMinor: refundMinor, requestedBy: input.by })
    refund = { id: asked.refundId, state: asked.state, amountMinor: refundMinor }
  }

  // The new seats first: if the performance has just filled, the batch fails and nothing changes.
  const claimed = (await claimSeats(unit, { holdId: hold.id, requests: [{ poolId: pool.id, quantity: chosen.length }], state: 'confirmed', expiresAt: null })).flat()
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
  if (paid && newMinor > 0) {
    const back = spread(chosen, refundMinor)
    const moving = new Map<string, number>()
    for (const line of chosen) moving.set(line.performance_id, (moving.get(line.performance_id) ?? 0) + line.amount_minor)
    for (const [performanceId, amount] of back) moving.set(performanceId, moving.get(performanceId)! - amount)
    await postEntries(unit, {
      key: `box-office:exchange:${cancellationId}`,
      source: { module: 'box-office', type: 'order', id: order.id },
      kind: 'transfer',
      currency: order.currency,
      postedBy: input.by,
      entries: [...await takenBack(moving), ...await tagged(DEFERRED, new Map([[input.performanceId, newMinor]]), -1)],
    })
  }

  unit.announce('box-office.order.exchanged', { orderId: order.id, cancellationId: cancellationId! }, { record: ['box-office.order', order.id] })
  if (order.account_id) {
    const newLines = newIds.map(id => ({ id, performance_id: input.performanceId, band_id: input.bandId, ticket_type_id: input.ticketTypeId, amount_minor: priceMinor, type_name: '', type_kind: 'standard' }))
    const typeName = (await first<{ name: string }>('SELECT name FROM box_office_ticket_types WHERE id = ?', input.ticketTypeId))?.name ?? ''
    const was = await wordsFor(order, chosen, oldMinor)
    const now = await wordsFor(order, newLines.map(l => ({ ...l, type_name: typeName })), refundMinor)
    await notify(unit, 'box-office.order-exchanged', {
      to: order.account_id,
      variables: {
        reference: order.reference,
        was: `${was.tickets} for ${was.show}, ${was.when}`,
        now: `${now.tickets} for ${now.show}, ${now.when}`,
        money: refund ? `A refund of ${now.amount} will go back the way you paid.` : 'There is nothing more to pay.',
        codes: paid ? doorCodes.join('\n\n') : 'You pay for these at the box office when you arrive, as before.',
      },
      subject: ['box-office.order', order.id],
    })
  }
  return { orderId: order.id, cancellationId: cancellationId!, totalMinor, refund, doorCodes }
}
