// Baskets (Box office specification, part 3, "An order": nothing to basket). Pressing Hold tickets
// writes the order, its hold, a claim for every ticket and a line for each, in one batch, or
// nothing. The hold starts then and editing never moves its end. A basket has no account yet: it is
// opened again with the token handed back here, which is stored only as its hash and stays the
// browser's own through checkout.
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { orderLines } from './db/schema'
import { claimSeats } from './capacity'
import { hashOf, newReference, randomToken } from './codes'
import { pricesFor } from './prices'
import { poolsOf, salesOf } from './setup'

export interface BasketLineInput { bandId: string, ticketTypeId: string, quantity: number }
export interface BasketInput { performanceId: string, lines: BasketLineInput[] }

export interface Basket {
  orderId: string
  reference: string
  /** Opens the basket again. Shown once and never stored. */
  token: string
  expiresAt: number
  currency: string
  totalMinor: number
  lines: { id: string, bandId: string, ticketTypeId: string, amountMinor: number }[]
}

const NOT_ON_SALE: Record<string, { code: string, reason: string }> = {
  draft: { code: 'box-office.sales.not-yet', reason: 'This performance is not on sale yet.' },
  paused: { code: 'box-office.sales.paused', reason: 'Sales are paused for this performance.' },
  closed: { code: 'box-office.sales.closed', reason: 'Sales have closed for this performance.' },
}

/** When online sales close: the time set on the sales record, or the setting's time before curtain. */
export async function offSaleAt(sales: { offSaleAt: number | null }, startsAt: number): Promise<number> {
  return sales.offSaleAt ?? startsAt - (await useSetting('box-office.sales.close-before') as number) * 1000 // not-policy: seconds to milliseconds
}

export interface PricedLine { bandId: string, ticketTypeId: string, amountMinor: number }

/** Each ticket asked for, one line apiece, at the price in force at `at`, with the pools they come from. */
export async function pricedLines(performanceId: string, asked: BasketLineInput[], at: number): Promise<{ pool: Map<string, { id: string }>, lines: PricedLine[], currency: string }> {
  const [pools, prices, types] = await Promise.all([
    poolsOf(performanceId),
    pricesFor(performanceId, at),
    all<{ id: string, needs_paid_ticket: number }>('SELECT id, needs_paid_ticket FROM box_office_ticket_types WHERE active = 1'),
  ])
  const pool = new Map(pools.map(p => [p.bandId, p]))
  const price = new Map(prices.map(p => [`${p.bandId} ${p.ticketTypeId}`, p]))
  const type = new Map(types.map(t => [t.id, t]))
  for (const line of asked) {
    if (!pool.has(line.bandId) || !type.has(line.ticketTypeId) || !price.has(`${line.bandId} ${line.ticketTypeId}`))
      refuse('box-office.price.none', 'One of these tickets is not on sale for this performance.', { status: 422, remedy: 'Reload to see what is on sale.' })
  }
  if (asked.some(l => type.get(l.ticketTypeId)!.needs_paid_ticket) && !asked.some(l => !type.get(l.ticketTypeId)!.needs_paid_ticket))
    refuse('box-office.order.companion-alone', 'A companion ticket is booked together with the ticket it accompanies.', { status: 422 })
  const lines = asked.flatMap(l => Array.from({ length: l.quantity }, () => ({ bandId: l.bandId, ticketTypeId: l.ticketTypeId, amountMinor: price.get(`${l.bandId} ${l.ticketTypeId}`)!.amountMinor })))
  return { pool, lines, currency: prices[0]!.currency }
}

/** Adds an online basket to the unit: every ticket asked for is held together, or nothing is. */
export async function createBasket(unit: UnitView, input: BasketInput): Promise<Basket> {
  const sales = await salesOf(input.performanceId)
  if (!sales) refuse('box-office.sales.none', 'This performance is not sold here.', { status: 404 })
  const performance = await getPerformance(input.performanceId)
  const at = nowMs()
  const closes = await offSaleAt(sales, performance.startsAt)
  if (performance.state !== 'scheduled' || at >= closes) refuse(NOT_ON_SALE.closed!.code, NOT_ON_SALE.closed!.reason)
  if (sales.state !== 'on_sale') refuse(NOT_ON_SALE[sales.state]!.code, NOT_ON_SALE[sales.state]!.reason)

  const quantity = input.lines.reduce((sum, l) => sum + l.quantity, 0)
  const cap = sales.maxPerOrder ?? await useSetting('box-office.orders.seat-cap') as number
  if (quantity > cap) refuse('box-office.order.too-many', `At most ${cap} tickets in one order.`, { status: 422, remedy: 'For a larger group, ask the box office.' })

  const { pool, lines, currency } = await pricedLines(input.performanceId, input.lines, at)

  unit.add({ sql: "UPDATE box_office_performance_sales SET updated_at = updated_at WHERE id = ? AND state = 'on_sale' AND (off_sale_at IS NULL OR off_sale_at > ?)", params: [sales.id, at] })
    .expect(1, NOT_ON_SALE.paused)

  const orderId = newId('ord')
  const holdId = newId('hold')
  const reference = newReference()
  const token = randomToken()
  const holdFor = sales.holdMinutes !== null ? sales.holdMinutes * 60 : await useSetting('box-office.baskets.hold-for') as number // not-policy: minutes to seconds
  const expiresAt = at + holdFor * 1000 // not-policy: seconds to milliseconds
  const totalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0)

  unit.add({
    sql: "INSERT INTO box_office_orders (id, reference, channel, state, signed_in, currency, total_minor, basket_token_hash, expires_at, keep, created_at, updated_at) VALUES (?, ?, 'online', 'basket', 0, ?, ?, ?, ?, 0, ?, ?)",
    params: [orderId, reference, currency, totalMinor, await hashOf(token), expiresAt, at, at],
  })
  unit.add({ sql: "INSERT INTO box_office_holds (id, kind, order_id, created_at, updated_at) VALUES (?, 'basket', ?, ?, ?)", params: [holdId, orderId, at, at] })
  const claimed = (await claimSeats(unit, { holdId, requests: input.lines.map(l => ({ poolId: pool.get(l.bandId)!.id, quantity: l.quantity })), expiresAt })).flat()
  const lineIds = unit.insertSet(orderLines, lines.map((l, i) => ({
    orderId, kind: 'ticket', performanceId: input.performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimed[i], listMinor: l.amountMinor, discountMinor: 0, amountMinor: l.amountMinor, state: 'live',
  })))
  unit.expect(lines.length)
  return { orderId, reference, token, expiresAt, currency, totalMinor, lines: lines.map((l, i) => ({ id: lineIds[i]!, ...l })) }
}

export interface BasketView {
  orderId: string
  reference: string
  state: string
  expiresAt: number | null
  currency: string
  totalMinor: number
  lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, amountMinor: number }[]
}

/** A basket, for whoever holds its token. A lapsed basket holds nothing and says so. */
export async function basketByToken(orderId: string, token: string): Promise<BasketView | null> {
  const order = await first<{ id: string, reference: string, state: string, expires_at: number | null, currency: string, total_minor: number }>(
    'SELECT id, reference, state, expires_at, currency, total_minor FROM box_office_orders WHERE id = ? AND basket_token_hash = ?', orderId, await hashOf(token))
  if (!order) return null
  const lapsed = order.state === 'basket' && order.expires_at !== null && order.expires_at <= nowMs()
  const lines = lapsed
    ? []
    : await all<{ id: string, performance_id: string, band_id: string, ticket_type_id: string, amount_minor: number }>(
        "SELECT id, performance_id, band_id, ticket_type_id, amount_minor FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' AND state = 'live' ORDER BY id", orderId)
  return {
    orderId: order.id,
    reference: order.reference,
    state: lapsed ? 'expired' : order.state,
    expiresAt: order.expires_at,
    currency: order.currency,
    totalMinor: lapsed ? 0 : order.total_minor,
    lines: lines.map(l => ({ id: l.id, performanceId: l.performance_id, bandId: l.band_id, ticketTypeId: l.ticket_type_id, amountMinor: l.amount_minor })),
  }
}
