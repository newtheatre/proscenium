// The desk (R-3, R-4, R-5, BO-30; Box office specification, part 3, "Reserve now, pay at the desk",
// and part 4, "One payment with several owners"). A seller finds a reservation by its reference or
// desk code, changes it to who actually came, and takes payment through the till, where Box office
// is one panel among others. The panel prepares either a reservation or a new sale as an order
// waiting for that one payment; when the money arrives the settlement handler confirms it, issues
// the tickets and, if the buyer is standing there, admits them, in Payments' one batch. A payment
// that ends without the money puts a reservation back as it was and lets a new sale's seats go.
import { and, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, can, first, newId, nowMs, refuse, requireAbility, requirements, searchWords, useContext, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { accountLabel, addressFor, applyAtDesk, canonicalAccount, deskAccessForm, findAccounts, findOrCreateAccount, getPerformance, getProduction, listPerformances, operatingDayOf, placeName, type AccessApplication, type DeskAccessForm } from '#modules/core'
import type { DeskContext, PricedSale, PricingItem } from '#modules/payments'
import { passSalesMinor } from './pass-sales'
import { pricedLines, type BasketLineInput } from './baskets'
import { entitle, holderVerdict } from './entitlement'
import { signing } from '#kit/signing'
import { sellableTypes } from './ticket-types'
import { claimSeats } from './capacity'
import { carryPassEntries } from './pass-entries'
import { hashOf, newReference, randomToken } from './codes'
import { sendTickets } from './confirm'
import { siteUrl } from './links'
import { DOOR_CODE_PURPOSE, doorCodesForOrder, issueTickets, signedPart, ticketNumbers } from './tickets'
import { doorCodeKind } from './door-codes'
import { cancellations, orderLines, orders } from './db/schema'
import { attachExchange, exchangeDifference, isExchangeRecord, prepareExchange } from './exchange'
import { liveLines, ORDER, type LineRow, type OrderRow } from './orders'
import { pricesFor } from './prices'
import { moveTicketSavings, pricedTickets, redeemTickets, ticketItems, unpriced, type PricedTickets } from './promotions'
import { availability } from './availability'
import { salesOf } from './setup'

const DESK_HOLD = 30 * 60_000 // not-policy: as long as the till keeps a payment open; Payments ends the hold, not this time

// `references`: a buyer's student IDs or member numbers, typed by the seller in place of checking by hand.
// `holders`: the account named for each ticket of a type with requirements, found by card or by name.
const line = z.object({ bandId: z.string(), ticketTypeId: z.string(), quantity: z.number().int().min(1).max(500), references: z.array(z.string().max(64)).max(500).optional(), holders: z.array(z.string().max(64)).max(500).optional() }).strict() // not-policy: the setting's own ceiling; the longest reference any list holds
const reservationInput = z.object({ orderId: z.string(), expectedTotalMinor: z.number().int().min(0), admit: z.boolean().optional() }).strict()
// `email`, if the buyer wants their tickets sent: the order then belongs to the account for that address.
// `accountId` instead, when the seller picked the buyer from the person picker: the order is theirs.
// A code the buyer gives is the till's, for the whole sale: the till prices every panel together.
const saleInput = z.object({ performanceId: z.string(), lines: z.array(line).min(1).max(50), admit: z.boolean().optional(), email: z.email().max(254).optional(), accountId: z.string().min(1).max(64).optional() }).strict() // not-policy: more kinds of ticket than any performance sells; the longest address; an id
  .refine(sale => !(sale.email && sale.accountId), { message: 'A sale goes to an address or a person, not both.' })
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

/** The sale's tickets as the till priced them with its other panels (payments.pricing); at list prices when it did not. */
function deskDiscounts(lines: readonly unknown[], priced: PricedSale | undefined): PricedTickets {
  return priced ? pricedTickets(lines, priced) : unpriced(lines.length)
}

/** The panel's tickets for the till to price with the rest of the sale: a sale's only, since a reservation and an exchange are priced already. Reads only. */
export async function deskItems(context: Pick<DeskContext, 'input'>): Promise<PricingItem[]> {
  const input = panelInput(context.input)
  if (!('sale' in input)) return []
  return ticketItems(input.sale.performanceId, (await deskSale(input.sale, nowMs())).lines)
}

/**
 * Where the panel's sale happens, for a till session it opens: the space of the performance it is
 * for, when that performance is today (tonight's show); otherwise it says nothing. Reads only.
 */
export async function deskSpace(context: Pick<DeskContext, 'input'>): Promise<string | null> {
  const input = panelInput(context.input)
  const performanceId = 'sale' in input
    ? input.sale.performanceId
    : 'reservation' in input
      ? (await first<{ performance_id: string }>('SELECT performance_id FROM box_office_order_lines WHERE order_id = ? AND performance_id IS NOT NULL LIMIT 1', input.reservation.orderId))?.performance_id
      : input.exchange.performanceId
  if (!performanceId) return null
  const performance = await getPerformance(performanceId).catch(() => null)
  if (!performance?.spaceId) return null
  return await operatingDayOf(performance.startsAt) === await operatingDayOf(nowMs()) ? performance.spaceId : null
}

/** The panel's lines and amount, for the till to show. Reads only. */
export async function deskSummary(context: Pick<DeskContext, 'input' | 'priced'>): Promise<{ lines: { label: string, amountMinor: number, key?: string }[], amountMinor: number }> {
  const input = panelInput(context.input)
  if ('exchange' in input) {
    const { orderId, expectedDifferenceMinor: _, ...target } = input.exchange
    return exchangeDifference(orderId, target)
  }
  let lines: { label: string, amountMinor: number, key?: string }[]
  if ('reservation' in input) {
    lines = (await reservation(input.reservation.orderId)).lines.map(l => ({ label: l.type_name, amountMinor: l.amount_minor, key: l.id }))
  }
  else {
    const names = new Map((await all<{ id: string, name: string }>('SELECT id, name FROM box_office_ticket_types')).map(t => [t.id, t.name]))
    const at = nowMs()
    const priced = (await deskSale(input.sale, at)).lines
    const { discounts, priced: sale } = deskDiscounts(priced, context.priced)
    // A discounted ticket is named with the code it was given for, or the offer's own label.
    const nameOf = new Map(sale.applied.map(a => [a.promotionId, a.code ?? a.label]))
    const said = (i: number) => [...new Set(sale.savings.filter(s => s.key === String(i)).map(s => nameOf.get(s.promotionId)))].join(', ')
    lines = priced.map((l, i) => ({ label: discounts[i] ? `${names.get(l.ticketTypeId) ?? ''} (${said(i)})` : names.get(l.ticketTypeId) ?? '', amountMinor: l.amountMinor - (discounts[i] ?? 0) }))
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
  const tickets = deskDiscounts(lines, context.priced)
  const charged = lines.map((l, i) => l.amountMinor - (tickets.discounts[i] ?? 0))
  const totalMinor = charged.reduce((sum, amount) => sum + amount, 0)
  if (totalMinor <= 0) refuse('box-office.desk.nothing-to-pay', 'These tickets cost nothing, so there is no payment to take for them.', { status: 422 })
  const orderId = newId('ord')
  const holdId = newId('hold')
  const expiresAt = at + DESK_HOLD
  // An anonymous sale: nobody's details are taken unless the buyer wants the tickets sent. Then the
  // order belongs to the account for that address, made unclaimed if there is none, exactly as a
  // phone reservation does, and the confirmation goes there. The till is told nothing about them. An
  // order starts as a basket and moves on in the same batch, as one bought online does.
  const accountId = input.sale.accountId
    ? await pickedBuyer(input.sale.accountId)
    : input.sale.email ? (await findOrCreateAccount(unit, { address: input.sale.email, origin: 'guest' })).accountId : null
  unit.add(sql`INSERT INTO box_office_orders (id, reference, channel, state, account_id, signed_in, currency, total_minor, expires_at, keep, created_at, updated_at)
    VALUES (${orderId}, ${newReference()}, 'desk', 'basket', ${accountId}, 0, ${currency}, ${totalMinor}, ${expiresAt}, 0, ${at}, ${at})`)
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'basket', ${orderId}, ${actor.accountId ?? null}, ${at}, ${at})`)
  const claimed = (await claimSeats(unit, { holdId, requests: input.sale.lines.map(l => ({ poolId: pool.get(l.bandId)!.id, quantity: l.quantity })), expiresAt })).flat()
  guard(unit)
  const redemptions = await redeemTickets(unit, tickets, orderId, claimed)
  unit.insertSet(orderLines, lines.map((l, i) => ({
    orderId, kind: 'ticket', performanceId: input.sale.performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimed[i], priceId: l.priceId, listMinor: l.amountMinor, discountMinor: tickets.discounts[i] ?? 0, amountMinor: charged[i]!, state: 'live',
    requirementRef: l.requirement?.ref ?? null, requirementAccountId: l.requirement?.accountId ?? null, requirementEvidenceId: l.requirement?.evidence ?? null, promoRedemptionId: redemptions[i] ?? null,
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
  /** A reservation released unpaid: the buyer can be seated again if seats are free. */
  released: boolean
  /** Who booked, as Identity names them, and for what: so the seller can tell they have the right booking. */
  buyer: string | null
  performance: { title: string, startsAt: number } | null
  /** The payment being taken for it, while one is: it can be cancelled, which puts a reservation back as it was. */
  intentId: string | null
  lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, ticketType: string, amountMinor: number, admittedAt: number | null }[]
}

/** One order as the desk shows it. Nothing about the buyer: that is the account's, and Identity's to show. */
export async function deskOrder(orderId: string): Promise<DeskOrder | null> {
  const order = await first<{ id: string, reference: string, state: string, channel: string, currency: string, total_minor: number, release_at: number | null, keep: number, intent_id: string | null, account_id: string | null, reserved_at: number | null }>(
    'SELECT id, reference, state, channel, currency, total_minor, release_at, keep, intent_id, account_id, reserved_at FROM box_office_orders WHERE id = ?', orderId)
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
    released: order.state === 'expired' && order.reserved_at !== null,
    buyer: order.account_id ? await accountLabel(order.account_id) : null,
    performance: lines[0] ? await showOf(lines[0].performance_id) : null,
    intentId: order.state === 'awaiting_payment' ? order.intent_id : null,
    lines: lines.map(l => ({ id: l.id, performanceId: l.performance_id, bandId: l.band_id, ticketTypeId: l.ticket_type_id, ticketType: l.type_name, amountMinor: l.amount_minor, admittedAt: l.admitted_at })),
  }
}

async function showOf(performanceId: string): Promise<{ title: string, startsAt: number }> {
  const performance = await getPerformance(performanceId)
  return { title: (await getProduction(performance.productionId)).title, startsAt: performance.startsAt }
}

// A reservation released unpaid: still found, so the buyer can be seated again.
const RELEASED = sql`(${orders.state} = 'expired' AND ${orders.reservedAt} IS NOT NULL)`

const BY_NAME = 8 // not-policy: enough bookings under one name to pick from at the desk
const SINCE = 6 * 3_600_000 // not-policy: a performance that began this evening still counts as tonight's

/**
 * Finds an order by what the buyer shows: the booking reference or the desk code, typed or scanned.
 * Failing that, someone who may look people up finds bookings by the buyer's name or address: those
 * for performances still to come or tonight, soonest first.
 */
export async function findOrders(query: string, by?: { unit: UnitView, actor: Actor }): Promise<DeskOrder[]> {
  const exact = await findByCode(query)
  if (exact.length || !by || !searchWords(query).words.length || !(await can(by.actor, 'core.account.find')).allowed) return exact
  const buyers = await findAccounts(by.unit, by.actor, query, 'box-office.orders')
  const showing = sql`(SELECT min(p.starts_at) FROM box_office_order_lines l JOIN core_performances p ON p.id = l.performance_id
    WHERE l.order_id = ${orders.id} AND l.kind = 'ticket' AND l.state = 'live')`
  const found = await useDb().select({ id: orders.id }).from(orders)
    .where(and(or(inArray(orders.state, ['reserved', 'awaiting_payment', 'confirmed']), RELEASED), sql`${orders.accountId} IN (${buyers})`, sql`${showing} > ${nowMs() - SINCE}`))
    .orderBy(showing).limit(BY_NAME)
  return (await Promise.all(found.map(o => deskOrder(o.id)))).filter(o => o !== null)
}

async function findByCode(query: string): Promise<DeskOrder[]> {
  const typed = query.trim().toUpperCase()
  if (!typed) return []
  const found = await all<{ id: string }>(
    "SELECT id FROM box_office_orders WHERE (state IN ('reserved', 'awaiting_payment', 'confirmed', 'cancelled') OR (state = 'expired' AND reserved_at IS NOT NULL)) AND (reference = ?1 OR desk_code_hash = ?2) ORDER BY created_at DESC LIMIT 5", // not-policy: both are unique, so one is expected
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
  // A ticket that needs its holder named is the booking's buyer's.
  const holder = order.account_id ? await canonicalAccount(order.account_id) : null
  const retyped = retype.length ? await entitle(performanceId, retype.map(r => ({ ticketTypeId: r.ticketTypeId })), sellable, { channel: 'desk', account: holder }) : null
  retyped?.guard(unit)
  const added = add.length ? await pricedLines(performanceId, add, at, { channel: 'desk', account: holder }) : null
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
      orderId: order.id, kind: 'ticket', performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimed[i], priceId: l.priceId, listMinor: l.amountMinor, discountMinor: 0, amountMinor: l.amountMinor, state: 'live',
    })))
    unit.expect(added.lines.length)
  }
  const totalMinor = after.reduce((sum, l) => sum + l.amountMinor, 0) + await passSalesMinor(order.id)
  unit.add(sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
  return { orderId: order.id, totalMinor, amountDueMinor: totalMinor }
}

/**
 * Splits tickets off a reservation into a reservation of their own, so one of a group can pay for
 * theirs while the rest stay reserved (Matt, 2026-11-17). The new one has its own reference, the
 * same buyer, access note and prices, and the seats go with the tickets in the same batch, so no
 * one else can take them. Both keep at least one ticket, and neither is left with a companion ticket
 * alone. Nothing about money moves: neither is paid yet.
 */
export async function splitReservation(unit: UnitView, orderId: string, lineIds: string[], by: string): Promise<{ orderId: string, reference: string, totalMinor: number, remainingMinor: number }> {
  const { order, lines } = await reservation(orderId)
  const at = nowMs()
  const byId = new Map(lines.map(l => [l.id, l]))
  if (!lineIds.length || lineIds.some(id => !byId.has(id)) || new Set(lineIds).size !== lineIds.length)
    refuse(CHANGED.code, 'Those tickets are not on this reservation any more.', { status: 409, remedy: CHANGED.remedy })
  const moving = lines.filter(l => lineIds.includes(l.id))
  const staying = lines.filter(l => !lineIds.includes(l.id))
  if (!staying.length) refuse('box-office.desk.split-all', 'That is every ticket on the reservation, so there is nothing to split.', { status: 422, remedy: 'Take payment for the whole reservation instead.' })
  const companions = new Set((await all<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE kind = 'companion' OR needs_paid_ticket = 1")).map(t => t.id))
  if ([moving, staying].some(part => part.every(l => companions.has(l.ticket_type_id))))
    refuse('box-office.order.companion-alone', 'A companion ticket cannot stay on a booking without the ticket it accompanies.', { status: 422 })

  const newOrderId = newId('ord')
  const holdId = newId('hold')
  const reference = newReference()
  const movingMinor = moving.reduce((sum, l) => sum + l.amount_minor, 0)
  const remainingMinor = order.total_minor - movingMinor
  const ids = JSON.stringify(lineIds)
  unit.add(sql`INSERT INTO box_office_orders (id, reference, channel, state, account_id, signed_in, access_note, currency, total_minor, expires_at, release_at, keep, reserved_at, split_from_id, created_at, updated_at)
    SELECT ${newOrderId}, ${reference}, channel, 'basket', account_id, 0, access_note, currency, ${movingMinor}, expires_at, release_at, keep, reserved_at, id, ${at}, ${at}
      FROM box_office_orders WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
  // An order starts as a basket and moves on in the same batch, as every other does.
  unit.add(sql`UPDATE box_office_orders SET state = 'reserved' WHERE id = ${newOrderId} AND state = 'basket'`).expect(1)
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'reservation', ${newOrderId}, ${by}, ${at}, ${at})`)
  // A line keeps its order and its claim, so the tickets moving are new lines on the new order, at
  // the same prices, and the old ones are marked moved on as an exchange's are. Their seats are let go
  // and taken again in the same batch, so nobody else can take them in between.
  const found = await all<{ line_id: string, pool_id: string, promo_redemption_id: string | null }>(
    `SELECT l.id AS line_id, c.pool_id, l.promo_redemption_id FROM box_office_order_lines l JOIN box_office_claims c ON c.id = l.claim_id
      WHERE l.order_id = ? AND l.id IN (SELECT value FROM json_each(?))`, order.id, ids)
  const pools = new Map(found.map(r => [r.line_id, r.pool_id]))
  const savingOf = new Map(found.map(r => [r.line_id, r.promo_redemption_id]))
  if (pools.size !== lineIds.length) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'exchanged'
    WHERE state = 'confirmed' AND id IN (SELECT claim_id FROM box_office_order_lines WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids})))`).expect(lineIds.length, CHANGED)
  unit.add(sql`UPDATE box_office_order_lines SET state = 'exchanged', updated_at = ${at}
    WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(lineIds.length, CHANGED)
  const claimed = (await claimSeats(unit, { holdId, requests: lineIds.map(id => ({ poolId: pools.get(id)!, quantity: 1 })), state: 'confirmed', expiresAt: null })).flat()
  // A promotion's use goes with the seat it was given for, counted once.
  const savings = await moveTicketSavings(unit, newOrderId, lineIds.map((id, i) => ({ redemptionId: savingOf.get(id) ?? null, claimId: claimed[i]! })))
  lineIds.forEach((id, i) => {
    const saving = savingOf.get(id) ?? null
    unit.add(sql`INSERT INTO box_office_order_lines (id, order_id, kind, performance_id, band_id, ticket_type_id, claim_id, price_id, list_minor, discount_minor, amount_minor, promo_redemption_id, pass_redemption_id, comp_request_id, requirement_ref, requirement_account_id, requirement_evidence_id, state, created_at, updated_at)
      SELECT ${newId('orl')}, ${newOrderId}, kind, performance_id, band_id, ticket_type_id, ${claimed[i]}, price_id, list_minor, discount_minor, amount_minor, ${saving ? savings.get(saving) ?? saving : null}, pass_redemption_id, comp_request_id, requirement_ref, requirement_account_id, requirement_evidence_id, 'live', ${at}, ${at}
        FROM box_office_order_lines WHERE id = ${id}`).expect(1, CHANGED)
  })
  await carryPassEntries(unit, newOrderId, lineIds.map((lineId, i) => ({ lineId, claimId: claimed[i]! })))
  unit.add(sql`UPDATE box_office_orders SET total_minor = ${remainingMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
  unit.audit({ action: 'update', record: ['box-office.order', order.id], detail: { splitTo: newOrderId, tickets: lineIds.length } })
  return { orderId: newOrderId, reference, totalMinor: movingMinor, remainingMinor }
}

const AHEAD = 14 * 86_400_000 // not-policy: how far ahead the desk's list of performances looks, in milliseconds
const MOST = 30 // not-policy: performances offered at the desk at once

export interface DeskPerformance {
  performanceId: string
  title: string
  startsAt: number
  state: string
  currency: string | null
  /**
   * `reference`, on a member price: what the buyer may give instead of the seller checking by hand,
   * worded by its source. `holder`: each ticket is for someone who qualifies, named at the till.
   */
  rows: { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number, reference?: { label: string, field?: string, shape: string }, holder?: true, companion?: true }[]
}

/**
 * A buyer the seller picked in the till's buyer box: the account they live on now, if it has an
 * address to send the tickets to. Selling already asked for box-office.order.sell, which is what
 * the box's search needs; the till still shows nothing about them.
 */
async function pickedBuyer(picked: string): Promise<string> {
  const accountId = await canonicalAccount(picked)
  if (!await addressFor(accountId, 'audience')) refuse('box-office.desk.no-address', 'There is no email address for this person, so the tickets cannot be sent.', { status: 422, remedy: 'Type their email address instead.' })
  return accountId
}

/** The performances a seller can sell for now: set up for sale, and not yet past the desk's closing time. */
export async function deskPerformances(): Promise<DeskPerformance[]> {
  const at = nowMs()
  const until = (await useSetting('box-office.sales.desk-until-after') as number) * 1000 // not-policy: seconds to milliseconds
  const sold = new Map((await all<{ performance_id: string, state: string }>("SELECT performance_id, state FROM box_office_performance_sales WHERE state <> 'draft'")).map(r => [r.performance_id, r.state]))
  const coming = (await listPerformances({ state: 'scheduled', from: at - until, to: at + AHEAD })).filter(p => sold.has(p.id) && p.startsAt + until > at).slice(0, MOST)
  // An online-only type is not offered at the desk.
  const kinds = await all<{ id: string, name: string, kind: string, requirement_refs: string | null }>("SELECT id, name, kind, requirement_refs FROM box_office_ticket_types WHERE channel <> 'online'")
  const names = new Map(kinds.map(t => [t.id, t.name]))
  // A companion ticket is named for the person on the access scheme it goes with, not the companion.
  const companions = new Set(kinds.filter(t => t.kind === 'companion').map(t => t.id))
  // A member price can take the buyer's reference, such as a student ID, typed by the seller in place of checking by hand.
  const refsOf = new Map(kinds.map(t => [t.id, t.requirement_refs ? JSON.parse(t.requirement_refs) as string[] : []]))
  const described = await requirements.describe([...new Set([...refsOf.values()].flat())])
  const referenceOf = (typeId: string) => (refsOf.get(typeId) ?? []).map(ref => described[ref]?.presentable).find(Boolean)
  return Promise.all(coming.map(async (performance) => {
    const [production, available] = await Promise.all([getProduction(performance.productionId), availability(performance.id)])
    return {
      performanceId: performance.id,
      title: production.title,
      startsAt: performance.startsAt,
      state: sold.get(performance.id)!,
      currency: available.currency,
      rows: available.bands.flatMap(b => b.prices.filter(x => names.has(x.ticketTypeId)).map((x) => {
        const reference = referenceOf(x.ticketTypeId)
        return { bandId: b.bandId, band: b.name, ticketTypeId: x.ticketTypeId, ticketType: names.get(x.ticketTypeId) ?? '', amountMinor: x.amountMinor, free: b.free, ...(reference ? { reference } : {}), ...(refsOf.get(x.ticketTypeId)?.length ? { holder: true as const } : {}), ...(companions.has(x.ticketTypeId) ? { companion: true as const } : {}) }
      })),
    }
  }))
}

export interface DeskSold {
  orderId: string
  reference: string
  /** Who the tickets were sent to, as Identity names them; null for a sale with nobody's details. */
  buyer: string | null
  performance: { id: string, title: string, startsAt: number } | null
  lines: { id: string, band: string | null, ticketType: string, amountMinor: number, admitted: boolean }[]
}

/**
 * What a till payment bought from Box office, for the panel shown after the sale (till proposal,
 * "after the sale"): each booking it paid for, with its reference, tickets and whether each is in.
 */
export async function deskSold(intentId: string): Promise<DeskSold[]> {
  // An order this payment bought, or one whose exchange to dearer tickets it paid the difference on.
  const paid = await all<{ id: string, reference: string, account_id: string | null }>(
    `SELECT id, reference, account_id FROM box_office_orders
      WHERE (intent_id = ?1 OR id IN (SELECT order_id FROM box_office_exchanges WHERE intent_id = ?1)) AND state = 'confirmed' ORDER BY created_at`, intentId)
  return Promise.all(paid.map(async (order) => {
    const lines = await all<{ id: string, performance_id: string, band_name: string | null, type_name: string, amount_minor: number, admitted_at: number | null }>(
      `SELECT l.id, l.performance_id, CASE WHEN (SELECT count(*) FROM box_office_bands o WHERE o.production_id = b.production_id) > 1 THEN b.name END AS band_name,
          t.name AS type_name, l.amount_minor, k.admitted_at
        FROM box_office_order_lines l JOIN box_office_ticket_types t ON t.id = l.ticket_type_id JOIN box_office_bands b ON b.id = l.band_id
        LEFT JOIN box_office_tickets k ON k.order_line_id = l.id AND k.state = 'valid'
        WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, order.id)
    const performance = lines[0] ? { id: lines[0].performance_id, ...await showOf(lines[0].performance_id) } : null
    return {
      orderId: order.id,
      reference: order.reference,
      buyer: order.account_id ? await accountLabel(order.account_id) : null,
      performance,
      lines: lines.map(l => ({ id: l.id, band: l.band_name, ticketType: l.type_name, amountMinor: l.amount_minor, admitted: l.admitted_at !== null })),
    }
  }))
}

/**
 * Emails the tickets of a desk sale made with nobody's details, when the buyer asks after paying.
 * The order joins the account for the address, or the person picked, as if given at the sale, and
 * the message links to the booking, which shows the tickets' codes. Once an order has a buyer this is
 * refused: it was sent to them already.
 */
export async function sendDeskTickets(unit: UnitView, orderId: string, to: { email?: string, accountId?: string }): Promise<{ buyer: string }> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'confirmed') refuse('box-office.desk.not-sold', 'These tickets are not paid for yet.', { status: 409 })
  if (order.account_id) refuse('box-office.desk.already-sent', 'These tickets were sent to the buyer already.', { status: 409, remedy: 'Send them again from the booking\'s page.' })
  const lines = await liveLines(order.id)
  if (!lines.length) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  await requireAbility(useContext().actor, 'box-office.order.sell', ['core.performance', lines[0]!.performance_id])
  const accountId = to.accountId ? await pickedBuyer(to.accountId) : (await findOrCreateAccount(unit, { address: to.email!, origin: 'guest' })).accountId
  const token = randomToken()
  const at = nowMs()
  unit.add(sql`UPDATE box_office_orders SET account_id = ${accountId}, link_token_hash = ${await hashOf(token)}, updated_at = ${at}
    WHERE id = ${order.id} AND state = 'confirmed' AND account_id IS NULL`).expect(1, { code: 'box-office.desk.already-sent', reason: 'These tickets were sent to the buyer already.' })
  await sendTickets(unit, order, lines, { accountId, token, dedupeKey: `confirmed:${order.id}` })
  unit.audit({ action: 'update', record: ['box-office.order', order.id], detail: { sentAfterSale: true } })
  return { buyer: await accountLabel(accountId) }
}

/**
 * The till's receipt is going to one person, for a paid sale with this order in it (Matt, 18
 * November: one receipt, which carries the tickets). The receipt links to a booking showing that
 * person's tickets and their codes, so no separate tickets email is sent:
 * - the whole sale's buyer, or the last person of a split sale to have their receipt sent, gets this
 *   booking, when it was made with nobody's details, as if they had been given at the sale;
 * - anyone else of a split sale has their tickets moved to a booking of their own, made for them now
 *   (each receipt is sent in a unit of its own, so this has room), at the prices they paid.
 * A booking that already has a buyer (a reservation, or a sale to someone the seller found) was sent
 * its tickets when it was confirmed: its first person keeps them there, and the receipt adds nothing.
 * A share is left where it is rather than leave a companion ticket without the ticket it accompanies.
 */
export async function deskReceiptLink(unit: UnitView, orderId: string, person: { position: number, to: { accountId?: string, email?: string }, items: { line: number, key: string | null, quantity: number }[] }): Promise<{ label: string, url: string } | null> {
  const order = await first<OrderRow & { split_from_id: string | null }>(`${ORDER.replace(' FROM ', ', split_from_id FROM ')} WHERE id = ?`, orderId)
  if (!order || order.state !== 'confirmed') return null
  // Every ticket line the order was made with, in the order the till's summary listed them; those
  // given to someone else since are no longer live here.
  const made = await all<{ id: string, state: string, ticket_type_id: string, performance_id: string, amount_minor: number }>(
    "SELECT id, state, ticket_type_id, performance_id, amount_minor FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' ORDER BY rowid", order.id)
  const live = made.filter(l => l.state === 'live')
  const mine = person.position === 0
    ? live
    : [...new Set(person.items.flatMap(i => (i.key ? [made.find(l => l.id === i.key)] : made.slice(i.line, i.line + i.quantity))))].flatMap(l => (l && l.state === 'live' ? [l] : []))
  if (!mine.length) return null
  const rest = live.filter(l => !mine.includes(l))
  if (order.account_id) {
    if (person.position <= 1) return null
  }
  else if (!rest.length) return joinBuyer(unit, order.id, person.to)
  const companions = new Set((await all<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE kind = 'companion' OR needs_paid_ticket = 1")).map(t => t.id))
  const alone = (ls: typeof live) => ls.every(l => companions.has(l.ticket_type_id))
  if (alone(mine) || alone(rest)) return null
  const accountId = person.to.accountId ?? (await findOrCreateAccount(unit, { address: person.to.email!, origin: 'guest' })).accountId
  const { token } = await splitPaid(unit, order, mine.map(l => l.id), accountId)
  return { label: 'Show my tickets', url: await siteUrl(`/book/order/${token}`) }
}

/** Gives a desk booking nobody owns yet to the person its receipt goes to, and the link to it. */
async function joinBuyer(unit: UnitView, orderId: string, buyer: { accountId?: string, email?: string }): Promise<{ label: string, url: string }> {
  const accountId = buyer.accountId ?? (await findOrCreateAccount(unit, { address: buyer.email!, origin: 'guest' })).accountId
  const token = randomToken()
  unit.add(sql`UPDATE box_office_orders SET account_id = ${accountId}, link_token_hash = ${await hashOf(token)}, updated_at = ${nowMs()}
    WHERE id = ${orderId} AND account_id IS NULL`).expect(1, { code: 'box-office.desk.already-sent', reason: 'These tickets were sent to the buyer already.' })
  unit.audit({ action: 'update', record: ['box-office.order', orderId], detail: { sentWithReceipt: true } })
  return { label: 'Show my tickets', url: await siteUrl(`/book/order/${token}`) }
}

const MOVED = { code: 'box-office.order.lines-changed', reason: 'These tickets have just changed.' }

/**
 * Moves some tickets of a paid booking to a new booking of their own for `accountId`, paid by the
 * same payment (one person's share of a split till sale). As splitting a reservation does, a line
 * keeps its order and its claim, so each ticket moves as a new line saying which it replaces, at the
 * same price, with its seat let go and taken again and any promo code's use moved with it in the
 * same batch. The old tickets are void and new ones issued, admitted if the sale was; nobody has
 * been sent the old ones. The booking's total and deferred income are unchanged in sum.
 */
async function splitPaid(unit: UnitView, order: OrderRow, lineIds: string[], accountId: string): Promise<{ orderId: string, token: string }> {
  const at = nowMs()
  const ids = JSON.stringify(lineIds)
  const lines = await all<{ id: string, performance_id: string, amount_minor: number, pool_id: string, promo_redemption_id: string | null }>(
    `SELECT l.id, l.performance_id, l.amount_minor, c.pool_id, l.promo_redemption_id FROM box_office_order_lines l JOIN box_office_claims c ON c.id = l.claim_id
      WHERE l.order_id = ? AND l.state = 'live' AND l.id IN (SELECT value FROM json_each(?)) ORDER BY l.rowid`, order.id, ids)
  if (lines.length !== lineIds.length) refuse(MOVED.code, MOVED.reason, { status: 409 })
  const orderId = newId('ord')
  const holdId = newId('hold')
  const token = randomToken()
  const movedMinor = lines.reduce((sum, l) => sum + l.amount_minor, 0)
  unit.add(sql`INSERT INTO box_office_orders (id, reference, channel, state, account_id, signed_in, access_note, currency, total_minor, reserved_at, split_from_id, intent_id, session_id, sold_by, admit_on_payment, keep, created_at, updated_at)
    SELECT ${orderId}, ${newReference()}, channel, 'basket', ${accountId}, 0, access_note, currency, ${movedMinor}, reserved_at, id, intent_id, session_id, sold_by, admit_on_payment, 0, ${at}, ${at}
      FROM box_office_orders WHERE id = ${order.id} AND state = 'confirmed'`).expect(1, MOVED)
  unit.add(sql`UPDATE box_office_orders SET state = 'confirmed', confirmed_at = ${at}, link_token_hash = ${await hashOf(token)} WHERE id = ${orderId} AND state = 'basket'`).expect(1)
  unit.add(sql`UPDATE box_office_orders SET total_minor = total_minor - ${movedMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = 'confirmed'`).expect(1, MOVED)
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'payment', ${orderId}, ${order.sold_by}, ${at}, ${at})`)
  unit.add(sql`UPDATE box_office_tickets SET state = 'void', void_reason = 'reissued', updated_at = ${at} WHERE state = 'valid' AND order_line_id IN (SELECT value FROM json_each(${ids}))`)
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'exchanged'
    WHERE state = 'confirmed' AND id IN (SELECT claim_id FROM box_office_order_lines WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids})))`).expect(lines.length, MOVED)
  unit.add(sql`UPDATE box_office_order_lines SET state = 'exchanged', updated_at = ${at}
    WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(lines.length, MOVED)
  const claimed = (await claimSeats(unit, { holdId, requests: lines.map(l => ({ poolId: l.pool_id, quantity: 1 })), state: 'confirmed', expiresAt: null })).flat()
  // A promotion's use goes with the seat it was given for, counted once.
  const savings = await moveTicketSavings(unit, orderId, lines.map((l, i) => ({ redemptionId: l.promo_redemption_id, claimId: claimed[i]! })))
  const moved = lines.map((l, i) => ({ old: l.id, id: newId('orl'), claim: claimed[i]!, redemption: l.promo_redemption_id ? savings.get(l.promo_redemption_id) ?? l.promo_redemption_id : null }))
  unit.add(sql`INSERT INTO box_office_order_lines (id, order_id, kind, performance_id, band_id, ticket_type_id, claim_id, price_id, list_minor, discount_minor, amount_minor, promo_redemption_id, pass_redemption_id, comp_request_id, requirement_ref, requirement_account_id, requirement_evidence_id, replaces_line_id, state, created_at, updated_at)
    SELECT json_extract(m.value, '$.id'), ${orderId}, l.kind, l.performance_id, l.band_id, l.ticket_type_id, json_extract(m.value, '$.claim'), l.price_id, l.list_minor, l.discount_minor, l.amount_minor, json_extract(m.value, '$.redemption'), l.pass_redemption_id, l.comp_request_id, l.requirement_ref, l.requirement_account_id, l.requirement_evidence_id, l.id, 'live', ${at}, ${at}
      FROM json_each(${JSON.stringify(moved)}) m JOIN box_office_order_lines l ON l.id = json_extract(m.value, '$.old')`).expect(lines.length, MOVED)
  await issueTickets(unit, moved.map((m, i) => ({ id: m.id, performance_id: lines[i]!.performance_id })), order.admit_on_payment && order.sold_by ? { by: order.sold_by, at } : undefined)
  unit.audit({ action: 'update', record: ['box-office.order', order.id], detail: { splitTo: orderId, tickets: lines.length, paidApart: true } })
  unit.announce('box-office.order.confirmed', { orderId, performanceIds: [...new Set(lines.map(l => l.performance_id))] }, { record: ['box-office.order', orderId] })
  return { orderId, token }
}

export interface PrintedTicket {
  lineId: string
  /** The short number a person reads off it, `K7MPQ2XR-1`. */
  number: string
  production: string
  startsAt: number
  venue: string
  /** The part of the house, where the show has more than one. */
  band: string | null
  ticketType: string
  /** Who it was named for, for a ticket of a type with requirements. */
  holder: string | null
  /** What the door scans; null for a ticket issued before codes were kept. */
  doorCode: string | null
  admitted: boolean
}

/**
 * A paid booking's tickets to print at the till (T3, "print"): each with its show, seats, type,
 * holder, number and the door code to scan. Asks the sell ability of the booking's performance, as
 * emailing them does, since the printout is the tickets themselves.
 */
export async function deskPrintable(orderId: string): Promise<{ reference: string, tickets: PrintedTicket[] }> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'confirmed') refuse('box-office.desk.not-sold', 'These tickets are not paid for yet.', { status: 409 })
  const lines = await all<{ id: string, performance_id: string, band_name: string | null, type_name: string, requirement_account_id: string | null }>(
    `SELECT l.id, l.performance_id, CASE WHEN (SELECT count(*) FROM box_office_bands o WHERE o.production_id = b.production_id) > 1 THEN b.name END AS band_name,
        t.name AS type_name, l.requirement_account_id
      FROM box_office_order_lines l JOIN box_office_ticket_types t ON t.id = l.ticket_type_id JOIN box_office_bands b ON b.id = l.band_id
      WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, order.id)
  if (!lines.length) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  for (const performanceId of new Set(lines.map(l => l.performance_id)))
    await requireAbility(useContext().actor, 'box-office.order.sell', ['core.performance', performanceId])
  const codes = new Map((await doorCodesForOrder(order.id)).map(k => [k.lineId, k]))
  const numbers = await ticketNumbers(order, lines.map(l => l.id))
  const shows = new Map<string, { production: string, startsAt: number, venue: string }>()
  for (const performanceId of new Set(lines.map(l => l.performance_id))) {
    const performance = await getPerformance(performanceId)
    shows.set(performanceId, { production: performance.productionTitle, startsAt: performance.startsAt, venue: await placeName(performance.spaceId) ?? performance.venueName })
  }
  const tickets = await Promise.all(lines.map(async (l, i) => ({
    lineId: l.id,
    number: numbers[i]!,
    ...shows.get(l.performance_id)!,
    band: l.band_name,
    ticketType: l.type_name,
    holder: l.requirement_account_id ? await accountLabel(l.requirement_account_id) : null,
    doorCode: codes.get(l.id)?.doorCode ?? null,
    admitted: codes.get(l.id)?.admitted ?? false,
  })))
  return { reference: order.reference, tickets }
}

export interface DeskHolder {
  accountId: string
  /** Who they are, as Identity names them, so the seller can see they have the right person. */
  label: string
  /** Whether they may have this ticket: met by their account, or not, with the source's words. */
  met: boolean
  reason: string | null
  /** Whether this seller may sell it to them anyway, having checked by hand. */
  mayOverride: boolean
  /**
   * Whether the seller may fill in the access scheme application with them, here at the till: the
   * ticket needs the scheme, such as a wheelchair space, and they have never applied. A submitted
   * application is enough to book, with the booking flagged for staff (Matt, 2026-11-17).
   */
  mayApply: boolean
}

/** A requirement the access scheme answers, such as core.access-scheme:wheelchair. */
const ACCESS_SCHEME = 'core.access-scheme:'

/**
 * The holder named for a ticket of a type with requirements, at the till (Matt, 17 November): by a
 * card scanned, such as a membership card, whose module says whose it is, or a person found by name.
 * Says whether they qualify, so the seller knows before taking payment; the sale checks again.
 */
export async function deskHolder(input: { performanceId: string, ticketTypeId: string, code?: string, accountId?: string }): Promise<DeskHolder> {
  const actor = useContext().actor
  await requireAbility(actor, 'box-office.order.sell', ['core.performance', input.performanceId])
  const type = (await sellableTypes()).get(input.ticketTypeId)
  if (!type || !type.requirementRefs.length) refuse('box-office.ticket-type.not-found', 'That kind of ticket does not need its holder named.', { status: 422 })
  let found: string | null = null
  if (input.code) {
    const parts = input.code.trim().split('.')
    const kind = parts.length === 4 ? await doorCodeKind(parts[0]!) : null // not-policy: kind, key id, code and signature
    const [k, keyId, random, signature] = parts as [string, string, string, string]
    if (!kind?.holder || !await signing.verify(DOOR_CODE_PURPOSE, keyId, signedPart(k, keyId, random), signature))
      refuse('box-office.desk.card-unknown', 'That is not a card we can read for this.', { status: 422, remedy: 'Find them by name instead.', fields: { holder: 'unknown' } })
    found = await kind.holder(random)
    if (!found) refuse('box-office.desk.card-unknown', 'That card is not known.', { status: 422, remedy: 'Find them by name instead.', fields: { holder: 'unknown' } })
  }
  else if (input.accountId) {
    found = input.accountId
  }
  else {
    refuse('box-office.desk.bad-input', 'Scan their card or find them by name.', { status: 422 })
  }
  const accountId = await canonicalAccount(found!)
  const verdict = await holderVerdict(input.performanceId, type, accountId)
  return {
    accountId,
    label: await accountLabel(accountId),
    met: !!verdict.met,
    reason: verdict.met ? null : verdict.reason ?? (verdict.unavailable ? `${type.name} tickets cannot be checked just now.` : `This person does not qualify for ${type.name} tickets, as far as we can tell.`),
    mayOverride: !verdict.met && (await can(actor, 'box-office.ticket-type.override-requirement', ['core.performance', input.performanceId])).allowed,
    mayApply: !verdict.met && type.requirementRefs.some(r => r.startsWith(ACCESS_SCHEME)) && accountId !== actor.accountId && (await deskAccessForm(accountId))?.applied === false,
  }
}

/**
 * The access scheme's application form for a seller to fill in with somebody at the till, found in
 * the till's own box. Asks the sell ability of the performance being sold. Refused while the scheme
 * is off; says only whether they have applied, never what they said.
 */
export async function deskAccessApplication(input: { performanceId: string, accountId: string }): Promise<DeskAccessForm & { accountId: string, label: string }> {
  const actor = useContext().actor
  await requireAbility(actor, 'box-office.order.sell', ['core.performance', input.performanceId])
  const accountId = await canonicalAccount(input.accountId)
  const form = await deskAccessForm(accountId)
  if (!form) refuse('core.not-found', 'The access scheme is not open.', { status: 404 })
  return { accountId, label: await accountLabel(accountId), ...form }
}

/** Sends that application, as made by staff, under the seller's ability to sell the performance. */
export async function deskApplyForAccess(unit: UnitView, input: { performanceId: string, accountId: string, application: AccessApplication }): Promise<{ status: string }> {
  const actor = useContext().actor
  await requireAbility(actor, 'box-office.order.sell', ['core.performance', input.performanceId])
  return applyAtDesk(unit, actor, await canonicalAccount(input.accountId), input.application, 'box-office.order.sell')
}
