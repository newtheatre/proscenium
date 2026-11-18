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
import { issuePass, passCodeHashes, shownPassCode } from './pass-holding'
import { getPassType, listPassTypes, type PassType } from './passes'
import { soldOn } from './ticket-types'

export interface PassBuy {
  passTypeId: string
  passPriceId: string
  /** The part of the house for its first entry, where there is more than one. */
  bandId?: string
  /** Its first entry is in a wheelchair space: still one entry. */
  wheelchair?: boolean
  /** At the till: false sells the pass on its own, with no entry at this performance. */
  entry?: boolean
  /** At the till: who holds it, picked by the seller. Otherwise the buyer. */
  accountId?: string
  /** At the till: an address typed for who holds it, the account for which is found or made as the sale is made. */
  email?: string
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

/** A pass on sale at the till, with whether it covers the performance being sold, so it can give its first entry there. */
export interface DeskPassOnSale extends Omit<PassOnSale, 'prices'> {
  covers: boolean
  holder: 'named' | 'open' | 'auto'
  prices: { id: string, name: string, amountMinor: number, proofNote: string | null, /** Only some people may have it: the seller checks. */ restricted: boolean }[]
}

/** Every pass on sale at the till: at the desk the seller checks who may have a price. */
export async function deskPassesOnSale(performanceId: string, at = nowMs()): Promise<DeskPassOnSale[]> {
  const types = (await listPassTypes()).filter(t => selling(t, 'desk', at))
  if (!types.length) return []
  const performance = await getPerformance(performanceId)
  const production = await getProduction(performance.productionId)
  return types.flatMap((type) => {
    const prices = type.prices.filter(p => p.active).map(p => ({ id: p.id, name: p.name, amountMinor: p.amountMinor, proofNote: p.proofNote, restricted: p.requirementRefs.length > 0 }))
    if (!prices.length) return []
    return [{ id: type.id, name: type.name, description: type.description, shows: type.covers === 'productions' ? type.productionIds.length : null, once: type.perShow === 'once', uses: type.uses, reserveUnpaid: type.reserveUnpaid, covers: covers(type, performance, production), holder: type.holder, prices }]
  })
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
    if (buy.entry !== false && !covers(type, performance, production))
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
      judged: { passId: newId('pass'), passTypeId: type.id, name: type.name, priceName: price.name, accountId: buyer.channel === 'online' ? buyer.account : buy.accountId ?? null, named, once: type.perShow === 'once', owedMinor: price.amountMinor, left: type.uses },
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

/** A pass used here whose money is collected with this order, and the sale line it was waiting on. */
export interface Owed { pass: JudgedPass, fromLine: string | null }

/**
 * Which passes used here are still to be paid for and are not waiting on a live booking: their
 * money is collected with this one. Reads only.
 */
export async function owedHere(passes: readonly JudgedPass[], at = nowMs()): Promise<Owed[]> {
  const out: Owed[] = []
  for (const pass of passes.filter(p => p.owedMinor > 0)) {
    const row = await first<{ order_line_id: string | null, waiting: number }>(
      `SELECT p.order_line_id, EXISTS (SELECT 1 FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id WHERE l.id = p.order_line_id AND l.state = 'live' AND ${LIVE_ORDER(at)}) AS waiting
        FROM box_office_passes p WHERE p.id = ? AND p.paid_at IS NULL`, pass.passId)
    if (row && !row.waiting) out.push({ pass, fromLine: row.order_line_id })
  }
  return out
}

/** Writes a sale line on this order for each pass `owedHere` found, and points the pass at it. */
export function carryOwed(unit: UnitView, orderId: string, owed: readonly Owed[], at = nowMs()): void {
  for (const { pass, fromLine } of owed) {
    const [lineId] = unit.insertSet(orderLines, [{ orderId, kind: 'pass_sale', listMinor: pass.owedMinor, discountMinor: 0, amountMinor: pass.owedMinor, state: 'live' }])
    unit.add(sql`UPDATE box_office_passes SET order_line_id = ${lineId!}, updated_at = ${at} WHERE id = ${pass.passId} AND paid_at IS NULL AND order_line_id IS ${fromLine}`).expect(1, MOVED)
  }
}

export interface PassSale { lineId: string, passId: string, /** Who holds it already, if anyone. */ accountId: string | null, name: string, priceName: string, amountMinor: number, /** As shown, PASS-XXXX-XXXX. */ code: string | null, /** Bought on this order, rather than an earlier pass's money collected here. */ fresh: boolean, reserveUnpaid: boolean }

/** The passes an order sells or collects for: its live sale lines. */
export async function passSalesOn(orderId: string): Promise<PassSale[]> {
  const rows = await all<{ line_id: string, pass_id: string, account_id: string | null, name: string, price_name: string, amount_minor: number, code: string | null, issued_at: number | null, reserve_unpaid: number }>(
    `SELECT l.id AS line_id, p.id AS pass_id, p.account_id, t.name, r.name AS price_name, l.amount_minor, p.code, p.issued_at, t.reserve_unpaid FROM box_office_order_lines l
      JOIN box_office_passes p ON p.order_line_id = l.id JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id
      WHERE l.order_id = ? AND l.kind = 'pass_sale' AND l.state = 'live' ORDER BY l.rowid`, orderId)
  return Promise.all(rows.map(async r => ({
    lineId: r.line_id, passId: r.pass_id, accountId: r.account_id, name: r.name, priceName: r.price_name, amountMinor: r.amount_minor, code: r.code ? shownPassCode(await openColumn(r.code) as string) : null, fresh: r.issued_at === null, reserveUnpaid: !!r.reserve_unpaid,
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

/**
 * Sends each pass bought on the order its code: to its holder, picked at the till or decided by who
 * paid for it in a split sale (`holders`), or else to the buyer. Called before the passes are
 * settled, while they are still new.
 */
export async function sendNewPasses(unit: UnitView, order: { id: string, currency: string }, accountId: string | null, paid: boolean, holders: ReadonlyMap<string, string> = new Map()): Promise<void> {
  for (const sale of (await passSalesOn(order.id)).filter(s => s.fresh && s.code)) {
    const to = holders.get(sale.passId) ?? sale.accountId ?? accountId
    if (!to) continue
    const amount = new Intl.NumberFormat((await useSetting('core.locale.language') as string | null) ?? 'en-GB', { style: 'currency', currency: order.currency }).format(sale.amountMinor / 100) // not-policy: minor units to units
    await notify(unit, 'box-office.pass-issued', {
      to,
      variables: { pass: sale.name, price: sale.priceName, code: sale.code!, paid: paid || !sale.amountMinor ? 'It is paid for.' : `There is ${amount} to pay for it, which is taken at the box office when you come to your first show.` },
      subject: ['box-office.pass', sale.passId],
      dedupeKey: `pass-issued:${sale.passId}`,
    })
  }
}

/**
 * The order's passes become the buyer's as it is reserved or confirmed, and are paid when it is
 * confirmed. A pass with a holder already keeps them; one in `holders` goes to that person.
 */
export function settlePassSales(unit: UnitView, orderId: string, accountId: string | null, paid: boolean, at = nowMs(), holders: ReadonlyMap<string, string> = new Map()): void {
  for (const [passId, holder] of holders)
    unit.add(sql`UPDATE box_office_passes SET account_id = COALESCE(account_id, ${holder}), updated_at = ${at} WHERE id = ${passId} AND paid_at IS NULL`)
  unit.add(sql`UPDATE box_office_passes SET issued_at = COALESCE(issued_at, ${at}), account_id = COALESCE(account_id, ${accountId}), paid_at = ${paid ? at : null}, updated_at = ${at}
    WHERE paid_at IS NULL AND order_line_id IN (SELECT id FROM box_office_order_lines WHERE order_id = ${orderId} AND kind = 'pass_sale' AND state = 'live')`)
}

/**
 * A pass whose money is still owed, found by its code, to be paid for at the till on its own. Its
 * money is taken with this sale unless a live booking is already waiting to collect it.
 */
export async function passOwing(typed: string): Promise<JudgedPass> {
  const row = await first<{ id: string, pass_type_id: string, name: string, price_name: string, account_id: string | null, named: number, once: number, amount_minor: number, paid_at: number | null, state: string, uses_total: number | null, uses_taken: number }>(
    `SELECT p.id, p.pass_type_id, t.name, r.name AS price_name, p.account_id, p.named, p.once, p.amount_minor, p.paid_at, p.state, p.uses_total, p.uses_taken
      FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id
      WHERE (p.code_hash = ? OR p.alias_hash = ?) AND p.issued_at IS NOT NULL`, ...await passCodeHashes(typed))
  if (!row) refuse('box-office.pass.unknown', 'We do not recognise that pass code.', { status: 422, remedy: 'Check how it is spelt. It is on the pass and in its email.', fields: { pass: 'unknown' } })
  if (row.state !== 'active') refuse('box-office.pass.void', 'That pass has been cancelled.', { status: 422, fields: { pass: 'void' } })
  if (row.paid_at || !row.amount_minor) refuse('box-office.pass.paid', `${row.name} is paid for already.`, { status: 409, fields: { pass: 'paid' } })
  return { passId: row.id, passTypeId: row.pass_type_id, name: row.name, priceName: row.price_name, accountId: row.account_id, named: !!row.named, once: !!row.once, owedMinor: row.amount_minor, left: row.uses_total === null ? null : row.uses_total - row.uses_taken }
}
