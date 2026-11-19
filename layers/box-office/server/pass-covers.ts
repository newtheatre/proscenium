// Using a pass for tickets already booked (Matt, 19 November; plan "Applying a pass to earlier
// bookings"). When someone gets a pass, the tickets they already hold for shows it covers can become
// its entries: the line stays where it is, in the same seat with the same ticket code, and what was
// to be paid for it is no longer owed. One ticket a performance, and one performance of a show for a
// pass of that kind, as any entry. Asked for while the pass is bought, the switch waits as `held`
// and is made when that booking is reserved or paid; asked for later, it is made at once. A ticket
// already paid for counts towards the pass: what it cost comes off what the pass still owes, and
// that money moves from the show's ticket income to Pass income. Staff may switch one that cost more
// than the pass still owes, refunding the difference under the usual refund approval.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, theatreTimeZone, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getPerformance, getProduction, notify } from '#modules/core'
import { postEntries } from '#modules/finance'
import { takenBack } from './cancel'
import { confirmOrder } from './confirm'
import { refundOrder } from './refunds'
import { passCovers } from './db/schema'
import { liveLines, ORDER, type OrderRow } from './orders'
import { covers, type PlannedPass } from './pass-sales'
import { getPassType, type PassType } from './passes'
import { HIDDEN_TYPE } from './ticket-types'

/** A ticket a pass could cover, as the person and staff are shown it. */
export interface CoverChoice {
  lineId: string
  orderId: string
  reference: string
  performanceId: string
  productionId: string
  show: string
  startsAt: number
  ticket: string
  amountMinor: number
  /** Paid for already: what it cost comes off the pass. */
  paid: boolean
  /** Paid for, and more than the pass still owes: only the box office can switch it. */
  ask: boolean
}

interface Candidate extends Omit<CoverChoice, 'ask'> { claimId: string, ticketTypeId: string, orderState: string, orderTotal: number, accountId: string }

/** What a pass has already, and how many more entries it may give: what a set of tickets must fit. */
interface Room { once: boolean, left: number | null, performances: Set<string>, productions: Set<string> }

const CHANGED = { code: 'box-office.pass.cover-changed', reason: 'Those tickets have just changed.', remedy: 'Reload to see them as they are now.' }
const PASS_INCOME = { key: 'box-office.pass-income' }

function refuseAsk(): never {
  refuse('box-office.pass.cover-ask', 'A ticket already paid for can only go towards a pass that still owes at least what the ticket cost.', { status: 422, remedy: 'Ask the box office, who can switch it and refund the difference.', fields: { cover: 'ask' } })
}

/**
 * The tickets someone holds that a pass of this kind could cover: live, neither free nor already a
 * pass's entry, and not waiting on another pass being bought. Reserved ones are for a performance
 * still to come; paid ones, whose ticket stands, may be for one already seen, but not one cancelled.
 */
async function candidates(account: string, type: PassType, at: number, asking = ''): Promise<Candidate[]> {
  const rows = await all<{ line_id: string, order_id: string, reference: string, state: string, total_minor: number, account_id: string, performance_id: string, claim_id: string, ticket_type_id: string, type_name: string, amount_minor: number }>(
    `SELECT l.id AS line_id, o.id AS order_id, o.reference, o.state, o.total_minor, o.account_id, l.performance_id, l.claim_id, l.ticket_type_id, t.name AS type_name, l.amount_minor
      FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
      WHERE l.kind = 'ticket' AND l.state = 'live' AND l.pass_redemption_id IS NULL AND l.comp_request_id IS NULL AND l.claim_id IS NOT NULL
        AND t.kind IN ('standard', 'concession') AND (t.managed_by IS NULL OR t.managed_by <> ?3) -- not-policy: a SQL parameter number
        AND o.account_id IN (${accountScopeSql('?1')})
        AND (o.state = 'reserved' OR (o.state = 'confirmed' AND EXISTS (SELECT 1 FROM box_office_tickets k WHERE k.order_line_id = l.id AND k.state = 'valid')))
        AND NOT EXISTS (SELECT 1 FROM box_office_pass_covers c JOIN box_office_orders a ON a.id = c.asked_on WHERE c.line_id = l.id AND c.state = 'held' AND a.id <> ?4 -- not-policy: a SQL parameter number
          AND (a.state = 'awaiting_payment' OR (a.state = 'basket' AND a.expires_at > ?2)))
      ORDER BY l.id`, // not-policy: SQL parameter numbers
    account, at, HIDDEN_TYPE, asking)
  const out: Candidate[] = []
  for (const r of rows) {
    const performance = await getPerformance(r.performance_id).catch(() => null)
    if (!performance) continue
    if (r.state === 'reserved' ? performance.state !== 'scheduled' || performance.startsAt <= at : performance.state === 'cancelled' || performance.state === 'draft') continue
    const production = await getProduction(performance.productionId)
    if (!covers(type, performance, production)) continue
    out.push({
      lineId: r.line_id, orderId: r.order_id, reference: r.reference, performanceId: r.performance_id, productionId: production.id, show: production.title, startsAt: performance.startsAt,
      ticket: r.type_name, amountMinor: r.amount_minor, paid: r.state === 'confirmed', claimId: r.claim_id, ticketTypeId: r.ticket_type_id, orderState: r.state, orderTotal: r.total_minor, accountId: r.account_id,
    })
  }
  return out
}

/** What an issued pass has booked with it already, and the entries it has left. */
async function roomOf(passId: string, at: number): Promise<Room & { pass: { id: string, passTypeId: string, accountId: string | null, state: string, owedMinor: number } }> {
  const pass = await first<{ id: string, pass_type_id: string, account_id: string | null, state: string, once: number, uses_total: number | null, owed_minor: number }>(
    'SELECT id, pass_type_id, account_id, state, once, uses_total, CASE WHEN paid_at IS NULL THEN amount_minor - credit_minor ELSE 0 END AS owed_minor FROM box_office_passes WHERE id = ?', passId)
  if (!pass) refuse('box-office.pass.not-found', 'There is no such pass.', { status: 404 })
  const used = await all<{ performance_id: string, production_id: string }>(
    `SELECT d.performance_id, d.production_id FROM box_office_pass_redemptions d JOIN box_office_orders o ON o.id = d.order_id
      WHERE d.pass_id = ? AND d.state = 'live' AND NOT (o.state = 'basket' AND o.expires_at <= ?) AND o.state NOT IN ('expired', 'cancelled')`, passId, at)
  return {
    pass: { id: pass.id, passTypeId: pass.pass_type_id, accountId: pass.account_id, state: pass.state, owedMinor: pass.owed_minor },
    once: !!pass.once,
    left: pass.uses_total === null ? null : pass.uses_total - used.length,
    performances: new Set(used.map(u => u.performance_id)),
    productions: new Set(used.map(u => u.production_id)),
  }
}

/**
 * The tickets offered, ticked to begin with, for `count` passes with this room each: the soonest
 * first and, where several are for one performance, the kind the pass is offered instead of, then
 * the dearest. A paid ticket must fit in what the passes still owe (`owed`), or it is only for the
 * box office to switch (`ask`). The rest stay as they are and are only counted.
 */
function choose(found: Candidate[], room: Room, count: number, prefer: readonly string[], owed: number): { picked: Candidate[], ask: Candidate[], others: number } {
  const sorted = [...found].sort((a, b) => a.startsAt - b.startsAt || Number(prefer.includes(b.ticketTypeId)) - Number(prefer.includes(a.ticketTypeId)) || b.amountMinor - a.amountMinor)
  const picked: Candidate[] = []
  const ask: Candidate[] = []
  let budget = owed
  const at = (key: string, list: Candidate[], of: (c: Candidate) => string) => list.filter(c => of(c) === key).length
  for (const c of sorted) {
    if (room.performances.has(c.performanceId) || (room.once && room.productions.has(c.productionId))) continue
    if (at(c.performanceId, picked, p => p.performanceId) >= count) continue
    if (room.once && at(c.productionId, picked, p => p.productionId) >= count) continue
    if (room.left !== null && picked.length >= room.left * count) continue
    if (c.paid && c.amountMinor > budget) {
      ask.push(c)
      continue
    }
    if (c.paid) budget -= c.amountMinor
    picked.push(c)
  }
  return { picked, ask, others: found.length - picked.length - ask.length }
}

/** Whether these tickets fit one pass: one a performance, one a show where it says so, within its entries. */
function fits(tickets: readonly Candidate[], room: Room): boolean {
  const performances = new Set(room.performances)
  const productions = new Set(room.productions)
  for (const t of tickets) {
    if (performances.has(t.performanceId) || (room.once && productions.has(t.productionId))) return false
    performances.add(t.performanceId)
    productions.add(t.productionId)
  }
  return room.left === null || tickets.length <= room.left
}

const shown = (c: Candidate, ask = false): CoverChoice => ({ lineId: c.lineId, orderId: c.orderId, reference: c.reference, performanceId: c.performanceId, productionId: c.productionId, show: c.show, startsAt: c.startsAt, ticket: c.ticket, amountMinor: c.amountMinor, paid: c.paid, ask })
const offered = ({ picked, ask }: { picked: Candidate[], ask: Candidate[] }): CoverChoice[] => [...picked.map(c => shown(c)), ...ask.map(c => shown(c, true))].sort((a, b) => a.startsAt - b.startsAt)

export interface CoverChoices { choices: CoverChoice[], /** Tickets for shows it covers that stay as they are: a second at one performance, or at one show. */ others: number }

/** The tickets an issued pass could cover, for its holder or for staff. Reads only. */
export async function coverChoicesFor(passId: string, at = nowMs()): Promise<CoverChoices> {
  const room = await roomOf(passId, at)
  if (!room.pass.accountId || room.pass.state !== 'active' || room.left === 0) return { choices: [], others: 0 }
  const type = await getPassType(room.pass.passTypeId)
  const chosen = choose(await candidates(room.pass.accountId, type, at), room, 1, [], room.pass.owedMinor)
  return { choices: offered(chosen), others: chosen.others }
}

/**
 * The tickets the signed-in buyer holds that passes bought now at this performance could cover, for
 * the offer on Choose tickets and at the till: tonight is each pass's first entry, unless it is sold
 * on its own, so tickets for tonight, and for tonight's show where a pass gives one performance of
 * each, are not offered. Reads only.
 */
export async function coverChoicesOnBuying(performanceId: string, passTypeId: string, passPriceId: string, count: number, account: string, at = nowMs(), entry = true): Promise<CoverChoices> {
  const type = await getPassType(passTypeId)
  const performance = await getPerformance(performanceId)
  const room: Room = entry
    ? { once: type.perShow === 'once', left: type.uses === null ? null : type.uses - 1, performances: new Set([performanceId]), productions: new Set([performance.productionId]) }
    : { once: type.perShow === 'once', left: type.uses, performances: new Set(), productions: new Set() }
  const price = type.prices.find(p => p.id === passPriceId)
  const chosen = choose(await candidates(account, type, at), room, Math.max(1, count), price?.insteadOf ?? [], (price?.amountMinor ?? 0) * Math.max(1, count))
  return { choices: offered(chosen), others: chosen.others }
}

/** Tickets to be covered by passes being bought, each matched to the pass that takes it. */
export interface PlannedCover { pass: number, ticket: Candidate }

/**
 * Matches the tickets asked for to the passes bought here, each to the first that can take it,
 * soonest first, checking each is the pass's holder's and fits. A paid ticket's price comes off the
 * pass it goes to (`creditMinor`), within what that pass costs. Refuses anything that does not fit.
 */
export async function planCovers(lineIds: readonly string[], planned: readonly PlannedPass[], performance: { id: string, productionId: string }, at: number): Promise<PlannedCover[]> {
  if (!lineIds.length) return []
  const unique = [...new Set(lineIds)]
  const rooms = planned.map(p => ({
    once: p.judged.once,
    left: p.judged.left === null ? null : p.judged.left - (p.buy.entry === false ? 0 : 1),
    performances: new Set(p.buy.entry === false ? [] : [performance.id]),
    productions: new Set(p.buy.entry === false ? [] : [performance.productionId]),
  }))
  const found = new Map<number, Candidate[]>()
  for (const [i, p] of planned.entries()) {
    if (!p.judged.accountId) continue
    found.set(i, await candidates(p.judged.accountId, await getPassType(p.judged.passTypeId), at))
  }
  const taken: Candidate[][] = planned.map(() => [])
  const out: PlannedCover[] = []
  const asked = unique.map(id => [...found.values()].flat().find(c => c.lineId === id))
  if (asked.some(c => !c)) refuse('box-office.pass.cover-not-yours', 'A pass can only be used for tickets its holder has reserved, for shows it covers that are still to come.', { status: 422, remedy: 'Reload to see the tickets it can cover.', fields: { cover: 'not-yours' } })
  for (const ticket of (asked as Candidate[]).sort((a, b) => a.startsAt - b.startsAt)) {
    const room = (n: number) => found.get(n)?.some(c => c.lineId === ticket.lineId) && fits([...taken[n]!, ticket], rooms[n]!)
    const i = planned.findIndex((p, n) => room(n) && (!ticket.paid || ticket.amountMinor <= p.amountMinor - p.creditMinor))
    if (i < 0 && ticket.paid && planned.some((_, n) => room(n))) refuseAsk()
    if (i < 0) refuse('box-office.pass.cover-too-many', 'A pass gives one entry at a performance, and some passes only one performance of each show.', { status: 422, remedy: 'Leave out the tickets that would be a second entry.', fields: { cover: 'too-many' } })
    taken[i]!.push(ticket)
    if (ticket.paid) planned[i]!.creditMinor += ticket.amountMinor
    out.push({ pass: i, ticket })
  }
  return out
}

/** Records the switches asked for with passes being bought, to be made when the booking buying them is reserved or paid. */
export function holdCovers(unit: UnitView, orderId: string, covers: readonly PlannedCover[], planned: readonly PlannedPass[], by: string | null): void {
  if (!covers.length) return
  unit.insertSet(passCovers, covers.map(c => ({ passId: planned[c.pass]!.judged.passId, lineId: c.ticket.lineId, orderId: c.ticket.orderId, askedOn: orderId, wasMinor: c.ticket.amountMinor, creditMinor: c.ticket.paid ? c.ticket.amountMinor : 0, refundMinor: 0, state: 'held', by })))
}

/**
 * Makes the switches waiting on a booking that has just been reserved or paid, in that batch. A
 * ticket that has changed since, or is no longer its pass's holder's, is let go and stays as it is,
 * unless it was paid for: the pass was priced with its money, so the batch is refused instead.
 */
export async function applyHeldCovers(unit: UnitView, orderId: string, accountId: string | null, at = nowMs()): Promise<void> {
  const held = await all<{ id: string, pass_id: string, line_id: string, was_minor: number, credit_minor: number, account_id: string | null, pass_type_id: string, once: number }>(
    `SELECT c.id, c.pass_id, c.line_id, c.was_minor, c.credit_minor, p.account_id, p.pass_type_id, p.once FROM box_office_pass_covers c JOIN box_office_passes p ON p.id = c.pass_id
      WHERE c.asked_on = ? AND c.state = 'held' ORDER BY c.id`, orderId)
  if (!held.length) return
  const byPass = new Map<string, typeof held>()
  for (const h of held) byPass.set(h.pass_id, [...(byPass.get(h.pass_id) ?? []), h])
  const items: Item[] = []
  for (const [passId, list] of byPass) {
    const holder = list[0]!.account_id ?? accountId
    const found = holder ? await candidates(holder, await getPassType(list[0]!.pass_type_id), at, orderId) : []
    const room = await roomOf(passId, at)
    const kept: Candidate[] = []
    for (const h of list) {
      const ticket = found.find(c => c.lineId === h.line_id && c.amountMinor === h.was_minor && (c.paid ? h.credit_minor === c.amountMinor : h.credit_minor === 0))
      if (ticket && fits([...kept, ticket], room)) {
        kept.push(ticket)
        items.push({ pass: { id: passId, once: !!list[0]!.once }, ticket, coverId: h.id, creditMinor: h.credit_minor })
      }
      else if (h.credit_minor > 0) {
        refuse(CHANGED.code, 'A ticket already paid for, which was to go towards this pass, has just changed.', { status: 409, remedy: 'Start again to see what the pass costs now.' })
      }
      else {
        unit.add(sql`UPDATE box_office_pass_covers SET state = 'lapsed', asked_on = NULL, updated_at = ${at} WHERE id = ${h.id} AND state = 'held'`)
      }
    }
  }
  await switchLines(unit, items, null, at)
}

/**
 * Uses an issued pass for tickets its holder already has, at once: from their account, from the
 * staff screen, or at the till. Each must be one the pass could cover now, and together they must fit.
 * With `refunds` (staff only), paid tickets may cost more than the pass still owes: soonest first,
 * each puts what the pass still owes towards it and the rest is refunded.
 */
export async function coverWithPass(unit: UnitView, passId: string, lineIds: readonly string[], by: string | null, at = nowMs(), refunds = false): Promise<{ covered: number, refundMinor: number }> {
  const room = await roomOf(passId, at)
  if (room.pass.state !== 'active') refuse('box-office.pass.void', 'That pass has been cancelled.', { status: 409 })
  if (!room.pass.accountId) refuse('box-office.pass.cover-no-holder', 'This pass is nobody\'s in particular, so it has no tickets of theirs to cover.', { status: 422, remedy: 'Give the pass to its holder first.' })
  const found = await candidates(room.pass.accountId, await getPassType(room.pass.passTypeId), at)
  const tickets = [...new Set(lineIds)].map(id => found.find(c => c.lineId === id))
  if (!tickets.length || tickets.some(t => !t)) refuse('box-office.pass.cover-not-yours', 'A pass can only be used for tickets its holder has reserved, for shows it covers that are still to come.', { status: 422, remedy: 'Reload to see the tickets it can cover.', fields: { cover: 'not-yours' } })
  if (!fits(tickets as Candidate[], room)) refuse('box-office.pass.cover-too-many', 'A pass gives one entry at a performance, and some passes only one performance of each show.', { status: 422, remedy: 'Leave out the tickets that would be a second entry.', fields: { cover: 'too-many' } })
  let budget = room.pass.owedMinor
  const shares = (tickets as Candidate[]).sort((a, b) => a.startsAt - b.startsAt).map((ticket) => {
    const creditMinor = ticket.paid ? Math.min(ticket.amountMinor, budget) : 0
    budget -= creditMinor
    return { ticket, creditMinor, refundMinor: ticket.paid ? ticket.amountMinor - creditMinor : 0 }
  })
  if (!refunds && shares.some(s => s.refundMinor > 0)) refuseAsk()
  const creditMinor = shares.reduce((sum, s) => sum + s.creditMinor, 0)
  const pass = await first<{ once: number }>('SELECT once FROM box_office_passes WHERE id = ?', passId)
  // What the pass still owes may be waiting on a reservation: that comes down by the credit too.
  let sale: Sale | null = null
  if (creditMinor > 0) {
    const waiting = await first<{ line_id: string, amount_minor: number, order_id: string, state: string, expires_at: number | null }>(
      `SELECT l.id AS line_id, l.amount_minor, o.id AS order_id, o.state, o.expires_at FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id JOIN box_office_orders o ON o.id = l.order_id
        WHERE p.id = ? AND p.paid_at IS NULL AND l.state = 'live'`, passId)
    if (waiting && (waiting.state === 'awaiting_payment' || (waiting.state === 'basket' && (waiting.expires_at ?? 0) > at)))
      refuse('box-office.pass.cover-paying', 'This pass is being paid for just now.', { status: 409, remedy: 'Try again once that payment is finished.' })
    if (waiting?.state === 'reserved') sale = { lineId: waiting.line_id, orderId: waiting.order_id, wasMinor: waiting.amount_minor, creditMinor }
  }
  await switchLines(unit, shares.map(s => ({ pass: { id: passId, once: !!pass!.once }, ...s })), by, at, sale)
  return { covered: tickets.length, refundMinor: shares.reduce((sum, s) => sum + s.refundMinor, 0) }
}

interface Item { pass: { id: string, once: boolean }, ticket: Candidate, coverId?: string, /** What the ticket paid that goes towards the pass, and what of it goes back. */ creditMinor: number, refundMinor?: number }
/** A pass's sale line on a reservation, still to be paid, that comes down by what is credited. */
interface Sale { lineId: string, orderId: string, wasMinor: number, creditMinor: number }

/**
 * The switch itself, in one batch: each ticket's line becomes the pass's entry where it stands, with
 * the pass's guard on the statement as for any entry; each booking's total comes down by what the
 * tickets cost; a reservation left with nothing to pay is confirmed and its tickets issued, as any
 * order with nothing to pay is; and the booking's holder is told. What paid tickets cost is the
 * pass's credit, moved from those shows' ticket income to Pass income, and a pass whose credit
 * reaches its price is paid.
 */
async function switchLines(unit: UnitView, items: readonly Item[], by: string | null, at: number, sale: Sale | null = null): Promise<void> {
  if (!items.length) return
  const names = new Map<string, string>()
  const coverIds = new Map<string, string>()
  // What paid tickets cost beyond what the pass owed goes back, one refund for each booking.
  const refunds = new Map<string, { id: string, state: 'requested' | 'approved', amountMinor: number }>()
  for (const orderId of new Set(items.filter(i => i.refundMinor).map(i => i.ticket.orderId))) {
    const order = (await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId))!
    const amountMinor = items.filter(i => i.ticket.orderId === orderId).reduce((sum, i) => sum + (i.refundMinor ?? 0), 0)
    refunds.set(orderId, await refundOrder(unit, order, amountMinor, by, 'Leave that ticket out.'))
  }
  for (const { pass, ticket, coverId, creditMinor, refundMinor = 0 } of items) {
    unit.add(sql`UPDATE box_office_passes SET credit_minor = credit_minor + ${creditMinor}, updated_at = ${at} WHERE id = ${pass.id} AND state = 'active' AND (uses_total IS NULL OR uses_taken < uses_total)
      AND credit_minor + ${creditMinor} <= amount_minor
      AND NOT EXISTS (SELECT 1 FROM box_office_pass_redemptions d WHERE d.pass_id = ${pass.id} AND d.state = 'live' AND (d.performance_id = ${ticket.performanceId} OR (d.once = 1 AND d.production_id = ${ticket.productionId})))`)
      .expect(1, { code: 'box-office.pass.just-used', reason: 'That pass has just been used for one of these.', remedy: 'Reload to see what it can still cover.' })
    const entryId = newId('pred')
    unit.add(sql`INSERT INTO box_office_pass_redemptions (id, pass_id, production_id, performance_id, order_id, claim_id, once, state, created_at, updated_at)
      VALUES (${entryId}, ${pass.id}, ${ticket.productionId}, ${ticket.performanceId}, ${ticket.orderId}, ${ticket.claimId}, ${pass.once ? 1 : 0}, 'live', ${at}, ${at})`)
    // The line keeps its seat, ticket type and ticket: the pass covers the whole of its price.
    unit.add(sql`UPDATE box_office_order_lines SET discount_minor = list_minor, amount_minor = 0, pass_redemption_id = ${entryId}, updated_at = ${at}
      WHERE id = ${ticket.lineId} AND state = 'live' AND pass_redemption_id IS NULL AND amount_minor = ${ticket.amountMinor}`).expect(1, CHANGED)
    if (coverId) unit.add(sql`UPDATE box_office_pass_covers SET state = 'applied', updated_at = ${at} WHERE id = ${coverId} AND state = 'held'`).expect(1, CHANGED)
    const id = coverId ?? unit.insertSet(passCovers, [{ passId: pass.id, lineId: ticket.lineId, orderId: ticket.orderId, wasMinor: ticket.amountMinor, creditMinor, refundMinor, refundId: refundMinor ? refunds.get(ticket.orderId)!.id : null, state: 'applied', by }])[0]!
    if (!coverIds.has(ticket.orderId)) coverIds.set(ticket.orderId, id)
    if (!names.has(pass.id)) names.set(pass.id, (await first<{ name: string }>('SELECT t.name FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id WHERE p.id = ?', pass.id))!.name)
  }
  for (const passId of new Set(items.filter(i => i.creditMinor > 0).map(i => i.pass.id)))
    unit.add(sql`UPDATE box_office_passes SET paid_at = ${at}, updated_at = ${at} WHERE id = ${passId} AND paid_at IS NULL AND issued_at IS NOT NULL AND credit_minor >= amount_minor`)
  if (sale) {
    unit.add(sql`UPDATE box_office_order_lines SET discount_minor = discount_minor + ${sale.creditMinor}, amount_minor = amount_minor - ${sale.creditMinor}, updated_at = ${at}
      WHERE id = ${sale.lineId} AND state = 'live' AND amount_minor = ${sale.wasMinor} AND amount_minor >= ${sale.creditMinor}`).expect(1, CHANGED)
  }

  const orders = new Map<string, Item[]>()
  for (const item of items) orders.set(item.ticket.orderId, [...(orders.get(item.ticket.orderId) ?? []), item])
  if (sale && !orders.has(sale.orderId)) orders.set(sale.orderId, [])
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  for (const [orderId, list] of orders) {
    const order = (await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId))!
    const offMinor = list.reduce((sum, i) => sum + i.ticket.amountMinor, 0) + (sale?.orderId === orderId ? sale.creditMinor : 0)
    const totalMinor = order.total_minor - offMinor
    unit.add(sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${orderId} AND state = ${order.state} AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
    if (totalMinor === 0 && order.state === 'reserved') {
      // Nothing is left to pay: confirmed now, its tickets issued and sent, as any free booking is.
      const lines = (await liveLines(orderId)).map(l => list.some(i => i.ticket.lineId === l.id) ? { ...l, amount_minor: 0 } : l)
      await confirmOrder(unit, { ...order, total_minor: 0 }, lines, { from: 'reserved' })
    }
    const creditMinor = list.reduce((sum, i) => sum + i.creditMinor, 0)
    if (creditMinor > 0) {
      // Money the show had for these tickets now pays for the pass instead.
      const shows = new Map<string, number>()
      for (const i of list) shows.set(i.ticket.performanceId, (shows.get(i.ticket.performanceId) ?? 0) + i.creditMinor)
      await postEntries(unit, {
        key: `box-office:pass-cover:${coverIds.get(orderId)}`,
        source: { module: 'box-office', type: 'order', id: orderId },
        kind: 'transfer',
        currency: order.currency,
        postedBy: by,
        entries: [...await takenBack(shows), { account: PASS_INCOME, amountMinor: -creditMinor, performanceId: null }],
      })
    }
    if (!order.account_id || !list.length) continue
    const format = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(minor / 100) // not-policy: minor units to units
    const when = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: await theatreTimeZone() })
    await notify(unit, 'box-office.pass-covered', {
      to: order.account_id,
      variables: {
        pass: [...new Set(list.map(i => names.get(i.pass.id)!))].join(' and '),
        tickets: list.map(i => `${i.ticket.ticket} for ${i.ticket.show}, ${when.format(i.ticket.startsAt)}`).join('; '),
        reference: order.reference,
        money: order.state === 'confirmed'
          ? [
              creditMinor ? `${format(creditMinor)} of what you paid for ${list.length === 1 ? 'that ticket' : 'those tickets'} now goes towards your pass.` : '',
              refunds.has(orderId) ? `${format(refunds.get(orderId)!.amountMinor)} ${refunds.get(orderId)!.state === 'approved' ? 'is' : 'will be'} refunded the way you paid.` : '',
            ].filter(Boolean).join(' ')
          : totalMinor === 0 ? 'There is nothing to pay on this booking now, and your tickets are on their way.' : `There is ${format(totalMinor)} left to pay on this booking, at the box office.`,
      },
      subject: ['box-office.order', orderId],
      dedupeKey: `pass-covered:${orderId}:${list.map(i => i.ticket.lineId).join(',')}`,
    })
  }
}

/** A pass on the person's own account, by id, or a refusal that says nothing about anyone else's. */
export async function ownPass(passId: string, account: string): Promise<string> {
  const row = await first<{ id: string }>(`SELECT id FROM box_office_passes WHERE id = ?1 AND issued_at IS NOT NULL AND account_id IN (${accountScopeSql('?2')})`, passId, account) // not-policy: SQL parameter numbers
  if (!row) refuse('box-office.pass.not-found', 'There is no such pass.', { status: 404 })
  return row.id
}
