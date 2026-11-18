// Selling a pass (BO-64; mock-up approved by Matt 2026-11-18). A pass is bought with a booking: it
// is a `pass_sale` line on the order beside the tickets, and the booking's own ticket is the pass's
// first entry. Paying for the pass rides on a reservation. Bought and paid for, it is paid when the
// order is confirmed. Bought and reserved, it is the holder's at once and is paid when the
// reservation is paid at the box office. A pass still unpaid whose reservation came to nothing is
// collected with whatever booking it is next used on: its sale line is written again there. The
// money is pass income when it is paid, never split between performances.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, openColumn, refuse, requirements, useSetting, type UnitView } from '#kit'
import { getPerformance, getProduction, notify } from '#modules/core'
import { orderLines } from './db/schema'
import type { JudgedPass } from './pass-entries'
import { issuePass, shownPassCode } from './pass-holding'
import { getPassType, listPassTypes, type PassType } from './passes'
import { soldOn } from './ticket-types'

export interface PassBuy {
  passTypeId: string
  passPriceId: string
  /** The part of the house for its first entry, where there is more than one. */
  bandId?: string
  /** Its first entry is in a wheelchair space: still one entry. */
  wheelchair?: boolean
}

type Buyer = { channel: 'online' | 'desk', account: string | null }

/** Whether a pass covers a performance: its dates, and its shows, season or everything. */
function covers(type: PassType, performance: { startsAt: number }, production: { id: string, seasonId: string | null }): boolean {
  return (type.coversFrom === null || performance.startsAt >= type.coversFrom) && (type.coversUntil === null || performance.startsAt < type.coversUntil)
    && (type.covers === 'dates' || (type.covers === 'season' && type.seasonId === production.seasonId) || (type.covers === 'productions' && type.productionIds.includes(production.id)))
}

const selling = (type: PassType, channel: 'online' | 'desk', at: number) =>
  type.active && type.onSale && soldOn(type.channel, channel) && (type.saleFrom === null || at >= type.saleFrom) && (type.saleUntil === null || at < type.saleUntil)

/** Whether an account may buy at a price only some people may have. Online it is checked; at the desk the seller looks. */
async function mayBuy(refs: string[], performanceId: string, buyer: Buyer): Promise<{ allowed: boolean, why: string | null }> {
  if (!refs.length || buyer.channel === 'desk') return { allowed: true, why: null }
  if (!buyer.account) return { allowed: false, why: 'sign-in' }
  const answers = await requirements.check({ accounts: [buyer.account], refs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
  return answers.some(a => a.verdict === 'met' && !a.unavailable) ? { allowed: true, why: null } : { allowed: false, why: answers.find(a => !a.unavailable && a.reason)?.reason ?? 'not-met' }
}

export interface PassOnSale {
  id: string
  name: string
  description: string | null
  /** How many shows it names, where it names them. */
  shows: number | null
  once: boolean
  uses: number | null
  reserveUnpaid: boolean
  prices: { id: string, name: string, amountMinor: number, proofNote: string | null, /** Whether this buyer may have it; `why` is sign-in, not-met or the reason given. */ allowed: boolean, why: string | null }[]
}

/** The passes on sale that cover a performance, with each price and whether this buyer may have it. */
export async function passesOnSale(performanceId: string, buyer: Buyer, at = nowMs()): Promise<PassOnSale[]> {
  const types = (await listPassTypes()).filter(t => selling(t, buyer.channel, at))
  if (!types.length) return []
  const performance = await getPerformance(performanceId)
  const production = await getProduction(performance.productionId)
  const out: PassOnSale[] = []
  for (const type of types.filter(t => covers(t, performance, production))) {
    const prices = []
    for (const price of type.prices.filter(p => p.active))
      prices.push({ id: price.id, name: price.name, amountMinor: price.amountMinor, proofNote: price.proofNote, ...await mayBuy(price.requirementRefs, performanceId, buyer) })
    if (prices.length) out.push({ id: type.id, name: type.name, description: type.description, shows: type.covers === 'productions' ? type.productionIds.length : null, once: type.perShow === 'once', uses: type.uses, reserveUnpaid: type.reserveUnpaid, prices })
  }
  return out
}

export interface PlannedPass {
  buy: PassBuy
  /** The pass as it will be, so its first entry can be taken in the same batch. */
  judged: JudgedPass
  amountMinor: number
  currency: string
}

/** Each pass asked for, checked before anything is held: on sale here, covering this performance, at a price this buyer may have. */
export async function planPassBuys(buys: readonly PassBuy[], performanceId: string, buyer: Buyer, at = nowMs()): Promise<PlannedPass[]> {
  if (!buys.length) return []
  const performance = await getPerformance(performanceId)
  const production = await getProduction(performance.productionId)
  const out: PlannedPass[] = []
  for (const buy of buys) {
    const type = await getPassType(buy.passTypeId)
    const price = type.prices.find(p => p.id === buy.passPriceId && p.active)
    if (!selling(type, buyer.channel, at) || !price)
      refuse('box-office.pass.not-on-sale', `${type.name} is not on sale here.`, { status: 422, remedy: 'Reload to see what is on sale.', fields: { pass: 'not-on-sale' } })
    if (!covers(type, performance, production))
      refuse('box-office.pass.not-covered', `${type.name} does not cover this show.`, { status: 422, remedy: 'Buy it with a booking for a show it covers.', fields: { pass: 'not-covered' } })
    const may = await mayBuy(price.requirementRefs, performanceId, buyer)
    if (!may.allowed) {
      refuse('box-office.pass.price-not-yours', may.why === 'sign-in' ? `The ${price.name} price is only for some people.` : may.why && may.why !== 'not-met' ? may.why : `You cannot have the ${price.name} price.`,
        { status: 403, remedy: may.why === 'sign-in' ? 'Sign in to buy at this price, or choose another.' : 'Choose another price, or ask the box office.', fields: { pass: 'price-not-yours' } })
    }
    const named = type.holder === 'named' || (type.holder === 'auto' && price.requirementRefs.length > 0)
    out.push({
      buy,
      amountMinor: price.amountMinor,
      currency: type.currency,
      judged: { passId: newId('pass'), passTypeId: type.id, name: type.name, priceName: price.name, accountId: buyer.channel === 'online' ? buyer.account : null, named, once: type.perShow === 'once', owedMinor: price.amountMinor, left: type.uses },
    })
  }
  return out
}

/**
 * Writes each new pass and its sale line on the order. The pass is nobody's yet: it becomes the
 * buyer's when the order is reserved or confirmed. Returns what the lines add to the total.
 */
export async function addPassSales(unit: UnitView, orderId: string, planned: readonly PlannedPass[], issuedBy: string | null): Promise<number> {
  if (!planned.length) return 0
  const lineIds = unit.insertSet(orderLines, planned.map(p => ({ orderId, kind: 'pass_sale', listMinor: p.amountMinor, discountMinor: 0, amountMinor: p.amountMinor, state: 'live' })))
  for (const [i, p] of planned.entries())
    await issuePass(unit, { id: p.judged.passId, passTypeId: p.judged.passTypeId, passPriceId: p.buy.passPriceId, accountId: p.judged.accountId, paid: false, issued: false, orderLineId: lineIds[i]!, issuedBy })
  return planned.reduce((sum, p) => sum + p.amountMinor, 0)
}

const LIVE_ORDER = (at: number) => `(o.state IN ('awaiting_payment', 'reserved') OR (o.state = 'basket' AND o.expires_at > ${Math.trunc(at)}))`
const MOVED = { code: 'box-office.pass.just-used', reason: 'That pass has just been used somewhere else.', remedy: 'Try again.' }

/**
 * A pass used here that is still to be paid for, and whose sale is not waiting on a live booking,
 * is collected with this one: a sale line is written on this order and the pass points at it.
 * Returns what that adds to the total.
 */
export async function carryOwed(unit: UnitView, orderId: string, passes: readonly JudgedPass[], at = nowMs()): Promise<number> {
  let added = 0
  for (const pass of passes.filter(p => p.owedMinor > 0)) {
    const row = await first<{ order_line_id: string | null, waiting: number }>(
      `SELECT p.order_line_id, EXISTS (SELECT 1 FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id WHERE l.id = p.order_line_id AND l.state = 'live' AND ${LIVE_ORDER(at)}) AS waiting
        FROM box_office_passes p WHERE p.id = ? AND p.paid_at IS NULL`, pass.passId)
    if (!row || row.waiting) continue
    const [lineId] = unit.insertSet(orderLines, [{ orderId, kind: 'pass_sale', listMinor: pass.owedMinor, discountMinor: 0, amountMinor: pass.owedMinor, state: 'live' }])
    unit.add(sql`UPDATE box_office_passes SET order_line_id = ${lineId!}, updated_at = ${at} WHERE id = ${pass.passId} AND paid_at IS NULL AND order_line_id IS ${row.order_line_id}`).expect(1, MOVED)
    added += pass.owedMinor
  }
  return added
}

export interface PassSale { lineId: string, passId: string, name: string, priceName: string, amountMinor: number, /** As shown, PASS-XXXX-XXXX. */ code: string | null, /** Bought on this order, rather than an earlier pass's money collected here. */ fresh: boolean, reserveUnpaid: boolean }

/** The passes an order sells or collects for: its live sale lines. */
export async function passSalesOn(orderId: string): Promise<PassSale[]> {
  const rows = await all<{ line_id: string, pass_id: string, name: string, price_name: string, amount_minor: number, code: string | null, issued_at: number | null, reserve_unpaid: number }>(
    `SELECT l.id AS line_id, p.id AS pass_id, t.name, r.name AS price_name, l.amount_minor, p.code, p.issued_at, t.reserve_unpaid FROM box_office_order_lines l
      JOIN box_office_passes p ON p.order_line_id = l.id JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id
      WHERE l.order_id = ? AND l.kind = 'pass_sale' AND l.state = 'live' ORDER BY l.id`, orderId)
  return Promise.all(rows.map(async r => ({
    lineId: r.line_id, passId: r.pass_id, name: r.name, priceName: r.price_name, amountMinor: r.amount_minor, code: r.code ? shownPassCode(await openColumn(r.code) as string) : null, fresh: r.issued_at === null, reserveUnpaid: !!r.reserve_unpaid,
  })))
}

/** What an order's live pass sale lines come to, which its total includes. */
export async function passSalesMinor(orderId: string): Promise<number> {
  return (await first<{ minor: number }>('SELECT COALESCE(sum(amount_minor), 0) AS minor FROM box_office_order_lines WHERE order_id = ? AND kind = \'pass_sale\' AND state = \'live\'', orderId))!.minor
}

/** A pass that must be paid for when it is bought cannot wait on a reservation. */
export async function assertMayReserve(orderId: string): Promise<void> {
  const sale = (await passSalesOn(orderId)).find(s => !s.reserveUnpaid)
  if (sale) refuse('box-office.pass.pay-first', `${sale.name} is paid for when it is booked with.`, { status: 409, remedy: 'Pay now, or bring it to the box office.', fields: { pass: 'pay-first' } })
}

/** Sends the buyer the code of each pass bought on the order. Called before the passes are settled, while they are still new. */
export async function sendNewPasses(unit: UnitView, order: { id: string, currency: string }, accountId: string | null, paid: boolean): Promise<void> {
  if (!accountId) return
  for (const sale of (await passSalesOn(order.id)).filter(s => s.fresh && s.code)) {
    const amount = new Intl.NumberFormat((await useSetting('core.locale.language') as string | null) ?? 'en-GB', { style: 'currency', currency: order.currency }).format(sale.amountMinor / 100) // not-policy: minor units to units
    await notify(unit, 'box-office.pass-issued', {
      to: accountId,
      variables: { pass: sale.name, price: sale.priceName, code: sale.code!, paid: paid || !sale.amountMinor ? 'It is paid for.' : `There is ${amount} to pay for it, which is taken at the box office when you come to your first show.` },
      subject: ['box-office.pass', sale.passId],
      dedupeKey: `pass-issued:${sale.passId}`,
    })
  }
}

/**
 * The order's passes become the buyer's as it is reserved or confirmed, and are paid when it is
 * confirmed. A pass with a holder already keeps them.
 */
export function settlePassSales(unit: UnitView, orderId: string, accountId: string | null, paid: boolean, at = nowMs()): void {
  unit.add(sql`UPDATE box_office_passes SET issued_at = COALESCE(issued_at, ${at}), account_id = COALESCE(account_id, ${accountId}), paid_at = ${paid ? at : null}, updated_at = ${at}
    WHERE paid_at IS NULL AND order_line_id IN (SELECT id FROM box_office_order_lines WHERE order_id = ${orderId} AND kind = 'pass_sale' AND state = 'live')`)
}
