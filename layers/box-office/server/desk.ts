// The desk (R-3, R-4, R-5, BO-30; Box office specification, part 3, "Reserve now, pay at the desk",
// and part 4, "One payment with several owners"). A seller finds a reservation by its reference or
// desk code, changes it to who actually came, and takes payment through the till, where Box office
// is one panel among others. The panel prepares either a reservation or a new sale as an order
// waiting for that one payment; when the money arrives the settlement handler confirms it, issues
// the tickets and, if the buyer is standing there, admits them, in Payments' one batch. A payment
// that ends without the money puts a reservation back as it was and lets a new sale's seats go.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, requireAbility, useContext, useSetting, type UnitView } from '#kit'
import { findOrCreateAccount, getPerformance, getProduction, listPerformances } from '#modules/core'
import type { DeskContext } from '#modules/payments'
import { pricedLines, type BasketLineInput } from './baskets'
import { entitle } from './entitlement'
import { sellableTypes } from './ticket-types'
import { claimSeats } from './capacity'
import { hashOf, newReference } from './codes'
import { cancellations, orderLines } from './db/schema'
import { attachExchange, exchangeDifference, isExchangeRecord, prepareExchange } from './exchange'
import { liveLines, ORDER, type LineRow, type OrderRow } from './orders'
import { pricesFor } from './prices'
import { availability } from './availability'
import { salesOf } from './setup'

const DESK_HOLD = 30 * 60_000 // not-policy: as long as the till keeps a payment open; Payments ends the hold, not this time

const line = z.object({ bandId: z.string(), ticketTypeId: z.string(), quantity: z.number().int().min(1).max(500) }).strict() // not-policy: the setting's own ceiling
const reservationInput = z.object({ orderId: z.string(), expectedTotalMinor: z.number().int().min(0), admit: z.boolean().optional() }).strict()
// `email`, if the buyer wants their tickets sent: the order then belongs to the account for that address.
const saleInput = z.object({ performanceId: z.string(), lines: z.array(line).min(1).max(50), admit: z.boolean().optional(), email: z.email().max(254).optional() }).strict() // not-policy: more kinds of ticket than any performance sells; the longest address
const id = z.string().min(1).max(64) // not-policy: shape bound
const exchangeInput = z.object({
  exchange: z.object({
    orderId: id,
    performanceId: id,
    lines: z.array(z.object({ lineId: id, bandId: id, ticketTypeId: id }).strict()).min(1).max(50), // not-policy: more lines than any order holds
    expectedDifferenceMinor: z.number().int().min(1),
  }).strict(),
}).strict()
type ReservationInput = z.infer<typeof reservationInput>
type SaleInput = z.infer<typeof saleInput>
type ExchangePanelInput = z.infer<typeof exchangeInput>['exchange']

/** What the seller put in Box office's panel: a reservation to pay for, tickets to sell, or the difference on an exchange. */
export function panelInput(input: unknown): { reservation: ReservationInput } | { sale: SaleInput } | { exchange: ExchangePanelInput } {
  const kind = !input || typeof input !== 'object' ? 'sale' : 'exchange' in input ? 'exchange' : 'orderId' in input ? 'reservation' : 'sale'
  const parsed = kind === 'exchange' ? exchangeInput.safeParse(input) : kind === 'reservation' ? reservationInput.safeParse(input) : saleInput.safeParse(input)
  if (!parsed.success) refuse('box-office.desk.bad-input', 'The box office panel was not filled in properly.', { status: 422 })
  if (kind === 'exchange') return { exchange: (parsed.data as z.infer<typeof exchangeInput>).exchange }
  return kind === 'reservation' ? { reservation: parsed.data as ReservationInput } : { sale: parsed.data as SaleInput }
}

const CHANGED = { code: 'box-office.order.lines-changed', reason: 'This reservation has just changed.', remedy: 'Find it again to see what is reserved.' }

async function reservation(orderId: string): Promise<{ order: OrderRow, lines: LineRow[] }> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'reserved') refuse('box-office.desk.not-reserved', 'This order is not a reservation waiting to be paid for.', { status: 409 })
  return { order, lines: await liveLines(order.id) }
}

async function deskSale(input: SaleInput, at: number) {
  const sales = await salesOf(input.performanceId)
  if (!sales || sales.state === 'draft') refuse('box-office.sales.none', 'This performance is not set up for sale.', { status: 404 })
  // Paused stops new sales at the desk as it does online. Closed is only online sales having ended.
  if (sales.state === 'paused') refuse('box-office.sales.paused', 'Sales are paused for this performance.', { status: 409 })
  const performance = await getPerformance(input.performanceId)
  const until = performance.startsAt + (await useSetting('box-office.sales.desk-until-after') as number) * 1000 // not-policy: seconds to milliseconds
  if (performance.state !== 'scheduled' || at >= until) refuse('box-office.sales.closed', 'Sales have closed for this performance.', { status: 409 })
  const quantity = input.lines.reduce((sum, l) => sum + l.quantity, 0)
  const cap = await useSetting('box-office.orders.desk-seat-cap') as number
  if (quantity > cap) refuse('box-office.order.too-many', `At most ${cap} tickets in one desk order.`, { status: 422 })
  return pricedLines(input.performanceId, input.lines, at, { channel: 'desk', account: null })
}

/** The panel's lines and amount, for the till to show. Reads only. */
export async function deskSummary(context: DeskContext): Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }> {
  const input = panelInput(context.input)
  if ('exchange' in input) {
    const { orderId, expectedDifferenceMinor: _, ...target } = input.exchange
    return exchangeDifference(orderId, target)
  }
  let lines: { label: string, amountMinor: number }[]
  if ('reservation' in input) {
    lines = (await reservation(input.reservation.orderId)).lines.map(l => ({ label: l.type_name, amountMinor: l.amount_minor }))
  }
  else {
    const names = new Map((await all<{ id: string, name: string }>('SELECT id, name FROM box_office_ticket_types')).map(t => [t.id, t.name]))
    lines = (await deskSale(input.sale, nowMs())).lines.map(l => ({ label: names.get(l.ticketTypeId) ?? '', amountMinor: l.amountMinor }))
  }
  return { lines, amountMinor: lines.reduce((sum, l) => sum + l.amountMinor, 0) }
}

/** Makes the panel's sale real but unpaid, as an order waiting for the till's payment. */
export async function deskPrepare(unit: UnitView, context: DeskContext): Promise<{ owner: { module: string, record: string }, amountMinor: number }> {
  const actor = useContext().actor
  const input = panelInput(context.input)
  const at = nowMs()

  if ('exchange' in input) {
    const { orderId, ...target } = input.exchange
    await requireAbility(actor, 'box-office.order.exchange', ['box-office.order', orderId])
    const { exchangeId, differenceMinor } = await prepareExchange(unit, orderId, target, actor.accountId!)
    return { owner: { module: 'box-office', record: exchangeId }, amountMinor: differenceMinor }
  }

  if ('reservation' in input) {
    const { order, lines } = await reservation(input.reservation.orderId)
    await requireAbility(actor, 'box-office.order.take-payment', ['box-office.order', order.id])
    if (order.total_minor !== input.reservation.expectedTotalMinor)
      refuse('box-office.order.total-changed', 'The amount due on this reservation has changed.', { status: 409, remedy: 'Find it again and check what is due.' })
    if (!lines.length || order.total_minor <= 0) refuse('box-office.desk.nothing-to-pay', 'There is nothing to pay on this reservation.', { status: 409 })
    // The seats stay as they are, confirmed under the reservation's hold: only the order moves.
    unit.add(sql`UPDATE box_office_orders SET state = 'awaiting_payment', session_id = ${context.sessionId}, sold_by = ${actor.accountId ?? null}, admit_on_payment = ${input.reservation.admit ? 1 : 0}, updated_at = ${at}
      WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
    return { owner: { module: 'box-office', record: order.id }, amountMinor: order.total_minor }
  }

  await requireAbility(actor, 'box-office.order.sell', ['core.performance', input.sale.performanceId])
  const { pool, lines, currency, guard } = await deskSale(input.sale, at)
  const totalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0)
  if (totalMinor <= 0) refuse('box-office.desk.nothing-to-pay', 'These tickets cost nothing, so there is no payment to take for them.', { status: 422 })
  const orderId = newId('ord')
  const holdId = newId('hold')
  const expiresAt = at + DESK_HOLD
  // An anonymous sale: nobody's details are taken unless the buyer wants the tickets sent. Then the
  // order belongs to the account for that address, made unclaimed if there is none, exactly as a
  // phone reservation does, and the confirmation goes there. The till is told nothing about them. An
  // order starts as a basket and moves on in the same batch, as one bought online does.
  const accountId = input.sale.email ? (await findOrCreateAccount(unit, { address: input.sale.email, origin: 'guest' })).accountId : null
  unit.add(sql`INSERT INTO box_office_orders (id, reference, channel, state, account_id, signed_in, currency, total_minor, expires_at, keep, created_at, updated_at)
    VALUES (${orderId}, ${newReference()}, 'desk', 'basket', ${accountId}, 0, ${currency}, ${totalMinor}, ${expiresAt}, 0, ${at}, ${at})`)
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'basket', ${orderId}, ${actor.accountId ?? null}, ${at}, ${at})`)
  const claimed = (await claimSeats(unit, { holdId, requests: input.sale.lines.map(l => ({ poolId: pool.get(l.bandId)!.id, quantity: l.quantity })), expiresAt })).flat()
  guard(unit)
  unit.insertSet(orderLines, lines.map((l, i) => ({
    orderId, kind: 'ticket', performanceId: input.sale.performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimed[i], listMinor: l.amountMinor, discountMinor: 0, amountMinor: l.amountMinor, state: 'live',
  })))
  unit.expect(lines.length)
  unit.add(sql`UPDATE box_office_orders SET state = 'awaiting_payment', session_id = ${context.sessionId}, sold_by = ${actor.accountId ?? null}, admit_on_payment = ${input.sale.admit ? 1 : 0}, updated_at = ${at}
    WHERE id = ${orderId} AND state = 'basket'`).expect(1)
  unit.add(sql`UPDATE box_office_holds SET kind = 'payment', updated_at = ${at} WHERE id = ${holdId} AND kind = 'basket'`).expect(1)
  return { owner: { module: 'box-office', record: orderId }, amountMinor: totalMinor }
}

/** Puts the till's payment on the order or exchange just prepared, so settling and releasing know it from any other. */
export function deskAttach(unit: UnitView, orderId: string, intentId: string): void {
  if (isExchangeRecord(orderId)) return attachExchange(unit, orderId, intentId)
  unit.add(sql`UPDATE box_office_orders SET intent_id = ${intentId} WHERE id = ${orderId} AND state = 'awaiting_payment' AND intent_id IS NULL`).expect(1, CHANGED)
}

export interface DeskOrder {
  orderId: string
  reference: string
  state: string
  channel: string
  currency: string
  totalMinor: number
  /** What is still to pay: the total of a reservation, nothing once confirmed. */
  amountDueMinor: number
  releaseAt: number | null
  keep: boolean
  lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, ticketType: string, amountMinor: number, admittedAt: number | null }[]
}

/** One order as the desk shows it. Nothing about the buyer: that is the account's, and Identity's to show. */
export async function deskOrder(orderId: string): Promise<DeskOrder | null> {
  const order = await first<{ id: string, reference: string, state: string, channel: string, currency: string, total_minor: number, release_at: number | null, keep: number }>(
    'SELECT id, reference, state, channel, currency, total_minor, release_at, keep FROM box_office_orders WHERE id = ?', orderId)
  if (!order) return null
  const lines = await all<{ id: string, performance_id: string, band_id: string, ticket_type_id: string, type_name: string, amount_minor: number, admitted_at: number | null }>(
    `SELECT l.id, l.performance_id, l.band_id, l.ticket_type_id, t.name AS type_name, l.amount_minor, k.admitted_at FROM box_office_order_lines l
      JOIN box_office_ticket_types t ON t.id = l.ticket_type_id LEFT JOIN box_office_tickets k ON k.order_line_id = l.id AND k.state = 'valid'
      WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, order.id)
  return {
    orderId: order.id,
    reference: order.reference,
    state: order.state,
    channel: order.channel,
    currency: order.currency,
    totalMinor: order.total_minor,
    amountDueMinor: order.state === 'reserved' || order.state === 'awaiting_payment' ? order.total_minor : 0,
    releaseAt: order.release_at,
    keep: !!order.keep,
    lines: lines.map(l => ({ id: l.id, performanceId: l.performance_id, bandId: l.band_id, ticketTypeId: l.ticket_type_id, ticketType: l.type_name, amountMinor: l.amount_minor, admittedAt: l.admitted_at })),
  }
}

/** Finds an order by what the buyer shows: the booking reference or the desk code, typed or scanned. */
export async function findOrders(query: string): Promise<DeskOrder[]> {
  const typed = query.trim().toUpperCase()
  if (!typed) return []
  const found = await all<{ id: string }>(
    "SELECT id FROM box_office_orders WHERE state IN ('reserved', 'awaiting_payment', 'confirmed', 'cancelled') AND (reference = ?1 OR desk_code_hash = ?2) ORDER BY created_at DESC LIMIT 5", // not-policy: both are unique, so one is expected
    typed, await hashOf(typed))
  return (await Promise.all(found.map(o => deskOrder(o.id)))).filter(o => o !== null)
}

export interface AmendInput {
  /** Lines to take off. */
  remove?: string[]
  /** Tickets to add, at the price in force now. */
  add?: BasketLineInput[]
  /** Lines to change to another ticket type, at that type's price when the order was reserved. */
  retype?: { lineId: string, ticketTypeId: string }[]
}

/**
 * Changes a reservation before payment is taken (R-4): tickets off, tickets on, or a ticket's type
 * changed, with the seats and the amount due moved in one batch. Adding takes seats through the
 * ordinary claim, so it is refused when the house is full.
 */
export async function amendReservation(unit: UnitView, orderId: string, input: AmendInput, by: string): Promise<{ orderId: string, totalMinor: number, amountDueMinor: number }> {
  const { order, lines } = await reservation(orderId)
  const at = nowMs()
  const remove = input.remove ?? []
  const retype = input.retype ?? []
  const add = input.add ?? []
  const byId = new Map(lines.map(l => [l.id, l]))
  const touched = [...remove, ...retype.map(r => r.lineId)]
  if (touched.some(id => !byId.has(id)) || new Set(touched).size !== touched.length) refuse(CHANGED.code, 'Those tickets are not on this reservation any more.', { status: 409, remedy: CHANGED.remedy })
  if (!lines.length) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  const performanceId = lines[0]!.performance_id
  // A change of type is priced as of when the order was reserved, so a later price rise is not charged for a swap.
  const reservedAt = (await first<{ reserved_at: number | null }>('SELECT reserved_at FROM box_office_orders WHERE id = ?', order.id))?.reserved_at ?? at
  const prices = new Map((await pricesFor(performanceId, reservedAt)).map(p => [`${p.bandId} ${p.ticketTypeId}`, p.amountMinor]))

  const kept: { typeId: string, amountMinor: number }[] = []
  for (const l of lines) {
    if (remove.includes(l.id)) continue
    const change = retype.find(r => r.lineId === l.id)
    if (!change) {
      kept.push({ typeId: l.ticket_type_id, amountMinor: l.amount_minor })
      continue
    }
    const amountMinor = prices.get(`${l.band_id} ${change.ticketTypeId}`)
    if (amountMinor === undefined) refuse('box-office.price.none', 'That kind of ticket is not sold for this part of the house.', { status: 422 })
    kept.push({ typeId: change.ticketTypeId, amountMinor })
    unit.add(sql`UPDATE box_office_order_lines SET ticket_type_id = ${change.ticketTypeId}, list_minor = ${amountMinor}, discount_minor = 0, amount_minor = ${amountMinor}, updated_at = ${at}
      WHERE id = ${l.id} AND order_id = ${order.id} AND state = 'live'`).expect(1, CHANGED)
  }
  // A change to a type with requirements is a desk sale of it: the seller must be able to check by hand.
  const sellable = await sellableTypes()
  if (retype.some(r => sellable.get(r.ticketTypeId)?.kind === 'complimentary' || !sellable.has(r.ticketTypeId)))
    refuse('box-office.price.none', 'That kind of ticket is not sold for this part of the house.', { status: 422 })
  const retyped = retype.length ? await entitle(performanceId, retype.map(r => ({ ticketTypeId: r.ticketTypeId })), sellable, { channel: 'desk', account: null }) : null
  retyped?.guard(unit)
  const added = add.length ? await pricedLines(performanceId, add, at, { channel: 'desk', account: null }) : null
  added?.guard(unit)
  const after = [...kept, ...(added?.lines ?? []).map(l => ({ typeId: l.ticketTypeId, amountMinor: l.amountMinor }))]
  if (!after.length) refuse('box-office.desk.nothing-left', 'That would leave nothing on the reservation.', { status: 422, remedy: 'Release the reservation instead.' })
  const cap = await useSetting('box-office.orders.desk-seat-cap') as number
  if (after.length > cap) refuse('box-office.order.too-many', `At most ${cap} tickets in one desk order.`, { status: 422 })
  const companions = new Set((await all<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE kind = 'companion' OR needs_paid_ticket = 1")).map(t => t.id))
  if (after.every(l => companions.has(l.typeId)))
    refuse('box-office.order.companion-alone', 'A companion ticket cannot stay on a booking without the ticket it accompanies.', { status: 422 })

  if (remove.length) {
    const ids = JSON.stringify(remove)
    unit.add(sql`UPDATE box_office_order_lines SET state = 'cancelled', updated_at = ${at}
      WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(remove.length, CHANGED)
    unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'cancelled'
      WHERE state = 'confirmed' AND id IN (SELECT claim_id FROM box_office_order_lines WHERE order_id = ${order.id} AND id IN (SELECT value FROM json_each(${ids})))`).expect(remove.length, CHANGED)
    unit.insertSet(cancellations, [{ orderId: order.id, kind: 'staff', lineIds: ids, feeMinor: 0, by }])
  }
  if (added) {
    const hold = await first<{ id: string }>("SELECT id FROM box_office_holds WHERE order_id = ? AND kind = 'reservation'", order.id)
    if (!hold) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
    const claimed = (await claimSeats(unit, { holdId: hold.id, requests: add.map(l => ({ poolId: added.pool.get(l.bandId)!.id, quantity: l.quantity })), state: 'confirmed', expiresAt: null })).flat()
    unit.insertSet(orderLines, added.lines.map((l, i) => ({
      orderId: order.id, kind: 'ticket', performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimed[i], listMinor: l.amountMinor, discountMinor: 0, amountMinor: l.amountMinor, state: 'live',
    })))
    unit.expect(added.lines.length)
  }
  const totalMinor = after.reduce((sum, l) => sum + l.amountMinor, 0)
  unit.add(sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
  return { orderId: order.id, totalMinor, amountDueMinor: totalMinor }
}

const AHEAD = 14 * 86_400_000 // not-policy: how far ahead the desk's list of performances looks, in milliseconds
const MOST = 30 // not-policy: performances offered at the desk at once

export interface DeskPerformance {
  performanceId: string
  title: string
  startsAt: number
  state: string
  currency: string | null
  rows: { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number }[]
}

/** The performances a seller can sell for now: set up for sale, and not yet past the desk's closing time. */
export async function deskPerformances(): Promise<DeskPerformance[]> {
  const at = nowMs()
  const until = (await useSetting('box-office.sales.desk-until-after') as number) * 1000 // not-policy: seconds to milliseconds
  const sold = new Map((await all<{ performance_id: string, state: string }>("SELECT performance_id, state FROM box_office_performance_sales WHERE state <> 'draft'")).map(r => [r.performance_id, r.state]))
  const coming = (await listPerformances({ state: 'scheduled', from: at - until, to: at + AHEAD })).filter(p => sold.has(p.id) && p.startsAt + until > at).slice(0, MOST)
  const names = new Map((await all<{ id: string, name: string }>('SELECT id, name FROM box_office_ticket_types')).map(t => [t.id, t.name]))
  return Promise.all(coming.map(async (performance) => {
    const [production, available] = await Promise.all([getProduction(performance.productionId), availability(performance.id)])
    return {
      performanceId: performance.id,
      title: production.title,
      startsAt: performance.startsAt,
      state: sold.get(performance.id)!,
      currency: available.currency,
      rows: available.bands.flatMap(b => b.prices.map(x => ({ bandId: b.bandId, band: b.name, ticketTypeId: x.ticketTypeId, ticketType: names.get(x.ticketTypeId) ?? '', amountMinor: x.amountMinor, free: b.free }))),
    }
  }))
}
