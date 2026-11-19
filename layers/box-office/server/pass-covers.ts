// Using a pass for tickets already booked (Matt, 19 November; plan "Applying a pass to earlier
// bookings"). When someone gets a pass, the tickets they already hold for shows it covers can become
// its entries: the line stays where it is, in the same seat with the same ticket code, and what was
// to be paid for it is no longer owed. One ticket a performance, and one performance of a show for a
// pass of that kind, as any entry. Asked for while the pass is bought, the switch waits as `held`
// and is made when that booking is reserved or paid; asked for later, it is made at once.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, theatreTimeZone, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getPerformance, getProduction, notify } from '#modules/core'
import { confirmOrder } from './confirm'
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
}

interface Candidate extends CoverChoice { claimId: string, ticketTypeId: string, orderState: string, orderTotal: number, accountId: string }

/** What a pass has already, and how many more entries it may give: what a set of tickets must fit. */
interface Room { once: boolean, left: number | null, performances: Set<string>, productions: Set<string> }

const CHANGED = { code: 'box-office.pass.cover-changed', reason: 'Those tickets have just changed.', remedy: 'Reload to see them as they are now.' }

/**
 * The tickets someone holds that a pass of this kind could cover: live, on a reservation of theirs
 * for a performance still to come that is not cancelled, neither free nor already a pass's entry,
 * and not waiting on another pass being bought.
 */
async function candidates(account: string, type: PassType, at: number, asking = ''): Promise<Candidate[]> {
  const rows = await all<{ line_id: string, order_id: string, reference: string, state: string, total_minor: number, account_id: string, performance_id: string, claim_id: string, ticket_type_id: string, type_name: string, amount_minor: number }>(
    `SELECT l.id AS line_id, o.id AS order_id, o.reference, o.state, o.total_minor, o.account_id, l.performance_id, l.claim_id, l.ticket_type_id, t.name AS type_name, l.amount_minor
      FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
      WHERE l.kind = 'ticket' AND l.state = 'live' AND l.pass_redemption_id IS NULL AND l.comp_request_id IS NULL AND l.claim_id IS NOT NULL
        AND t.kind IN ('standard', 'concession') AND (t.managed_by IS NULL OR t.managed_by <> ?3) -- not-policy: a SQL parameter number
        AND o.state = 'reserved' AND o.account_id IN (${accountScopeSql('?1')})
        AND NOT EXISTS (SELECT 1 FROM box_office_pass_covers c JOIN box_office_orders a ON a.id = c.asked_on WHERE c.line_id = l.id AND c.state = 'held' AND a.id <> ?4 -- not-policy: a SQL parameter number
          AND (a.state = 'awaiting_payment' OR (a.state = 'basket' AND a.expires_at > ?2)))
      ORDER BY l.id`, // not-policy: SQL parameter numbers
    account, at, HIDDEN_TYPE, asking)
  const out: Candidate[] = []
  for (const r of rows) {
    const performance = await getPerformance(r.performance_id).catch(() => null)
    if (!performance || performance.state !== 'scheduled' || performance.startsAt <= at) continue
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
async function roomOf(passId: string, at: number): Promise<Room & { pass: { id: string, passTypeId: string, accountId: string | null, state: string } }> {
  const pass = await first<{ id: string, pass_type_id: string, account_id: string | null, state: string, once: number, uses_total: number | null }>('SELECT id, pass_type_id, account_id, state, once, uses_total FROM box_office_passes WHERE id = ?', passId)
  if (!pass) refuse('box-office.pass.not-found', 'There is no such pass.', { status: 404 })
  const used = await all<{ performance_id: string, production_id: string }>(
    `SELECT d.performance_id, d.production_id FROM box_office_pass_redemptions d JOIN box_office_orders o ON o.id = d.order_id
      WHERE d.pass_id = ? AND d.state = 'live' AND NOT (o.state = 'basket' AND o.expires_at <= ?) AND o.state NOT IN ('expired', 'cancelled')`, passId, at)
  return {
    pass: { id: pass.id, passTypeId: pass.pass_type_id, accountId: pass.account_id, state: pass.state },
    once: !!pass.once,
    left: pass.uses_total === null ? null : pass.uses_total - used.length,
    performances: new Set(used.map(u => u.performance_id)),
    productions: new Set(used.map(u => u.production_id)),
  }
}

/**
 * The tickets offered, ticked to begin with, for `count` passes with this room each: the soonest
 * first and, where several are for one performance, the kind the pass is offered instead of, then
 * the dearest. The rest stay as they are and are only counted.
 */
function choose(found: Candidate[], room: Room, count: number, prefer: readonly string[]): { picked: Candidate[], others: number } {
  const sorted = [...found].sort((a, b) => a.startsAt - b.startsAt || Number(prefer.includes(b.ticketTypeId)) - Number(prefer.includes(a.ticketTypeId)) || b.amountMinor - a.amountMinor)
  const picked: Candidate[] = []
  const at = (key: string, list: Candidate[], of: (c: Candidate) => string) => list.filter(c => of(c) === key).length
  for (const c of sorted) {
    if (room.performances.has(c.performanceId) || (room.once && room.productions.has(c.productionId))) continue
    if (at(c.performanceId, picked, p => p.performanceId) >= count) continue
    if (room.once && at(c.productionId, picked, p => p.productionId) >= count) continue
    if (room.left !== null && picked.length >= room.left * count) continue
    picked.push(c)
  }
  return { picked, others: found.length - picked.length }
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

const shown = (c: Candidate): CoverChoice => ({ lineId: c.lineId, orderId: c.orderId, reference: c.reference, performanceId: c.performanceId, productionId: c.productionId, show: c.show, startsAt: c.startsAt, ticket: c.ticket, amountMinor: c.amountMinor, paid: c.paid })

export interface CoverChoices { choices: CoverChoice[], /** Tickets for shows it covers that stay as they are: a second at one performance, or at one show. */ others: number }

/** The tickets an issued pass could cover, for its holder or for staff. Reads only. */
export async function coverChoicesFor(passId: string, at = nowMs()): Promise<CoverChoices> {
  const room = await roomOf(passId, at)
  if (!room.pass.accountId || room.pass.state !== 'active' || room.left === 0) return { choices: [], others: 0 }
  const type = await getPassType(room.pass.passTypeId)
  const { picked, others } = choose(await candidates(room.pass.accountId, type, at), room, 1, [])
  return { choices: picked.map(shown), others }
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
  const prefer = type.prices.find(p => p.id === passPriceId)?.insteadOf ?? []
  const { picked, others } = choose(await candidates(account, type, at), room, Math.max(1, count), prefer)
  return { choices: picked.map(shown), others }
}

/** Tickets to be covered by passes being bought, each matched to the pass that takes it. */
export interface PlannedCover { pass: number, ticket: Candidate }

/**
 * Matches the tickets asked for to the passes bought here, each to the first that can take it,
 * soonest first, checking each is the pass's holder's and fits. Refuses anything that does not.
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
    const i = planned.findIndex((_, n) => found.get(n)?.some(c => c.lineId === ticket.lineId) && fits([...taken[n]!, ticket], rooms[n]!))
    if (i < 0) refuse('box-office.pass.cover-too-many', 'A pass gives one entry at a performance, and some passes only one performance of each show.', { status: 422, remedy: 'Leave out the tickets that would be a second entry.', fields: { cover: 'too-many' } })
    taken[i]!.push(ticket)
    out.push({ pass: i, ticket })
  }
  return out
}

/** Records the switches asked for with passes being bought, to be made when the booking buying them is reserved or paid. */
export function holdCovers(unit: UnitView, orderId: string, covers: readonly PlannedCover[], planned: readonly PlannedPass[], by: string | null): void {
  if (!covers.length) return
  unit.insertSet(passCovers, covers.map(c => ({ passId: planned[c.pass]!.judged.passId, lineId: c.ticket.lineId, orderId: c.ticket.orderId, askedOn: orderId, wasMinor: c.ticket.amountMinor, creditMinor: 0, refundMinor: 0, state: 'held', by })))
}

/**
 * Makes the switches waiting on a booking that has just been reserved or paid, in that batch. A
 * ticket that has changed since, or is no longer its pass's holder's, is let go and stays as it is.
 */
export async function applyHeldCovers(unit: UnitView, orderId: string, accountId: string | null, at = nowMs()): Promise<void> {
  const held = await all<{ id: string, pass_id: string, line_id: string, was_minor: number, account_id: string | null, pass_type_id: string, once: number }>(
    `SELECT c.id, c.pass_id, c.line_id, c.was_minor, p.account_id, p.pass_type_id, p.once FROM box_office_pass_covers c JOIN box_office_passes p ON p.id = c.pass_id
      WHERE c.asked_on = ? AND c.state = 'held' ORDER BY c.id`, orderId)
  if (!held.length) return
  const byPass = new Map<string, typeof held>()
  for (const h of held) byPass.set(h.pass_id, [...(byPass.get(h.pass_id) ?? []), h])
  const items: { pass: { id: string, once: boolean }, ticket: Candidate, coverId: string }[] = []
  for (const [passId, list] of byPass) {
    const holder = list[0]!.account_id ?? accountId
    const found = holder ? await candidates(holder, await getPassType(list[0]!.pass_type_id), at, orderId) : []
    const room = await roomOf(passId, at)
    const kept: Candidate[] = []
    for (const h of list) {
      const ticket = found.find(c => c.lineId === h.line_id && c.amountMinor === h.was_minor)
      if (ticket && fits([...kept, ticket], room)) {
        kept.push(ticket)
        items.push({ pass: { id: passId, once: !!list[0]!.once }, ticket, coverId: h.id })
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
 */
export async function coverWithPass(unit: UnitView, passId: string, lineIds: readonly string[], by: string | null, at = nowMs()): Promise<{ covered: number }> {
  const room = await roomOf(passId, at)
  if (room.pass.state !== 'active') refuse('box-office.pass.void', 'That pass has been cancelled.', { status: 409 })
  if (!room.pass.accountId) refuse('box-office.pass.cover-no-holder', 'This pass is nobody\'s in particular, so it has no tickets of theirs to cover.', { status: 422, remedy: 'Give the pass to its holder first.' })
  const found = await candidates(room.pass.accountId, await getPassType(room.pass.passTypeId), at)
  const tickets = [...new Set(lineIds)].map(id => found.find(c => c.lineId === id))
  if (!tickets.length || tickets.some(t => !t)) refuse('box-office.pass.cover-not-yours', 'A pass can only be used for tickets its holder has reserved, for shows it covers that are still to come.', { status: 422, remedy: 'Reload to see the tickets it can cover.', fields: { cover: 'not-yours' } })
  if (!fits(tickets as Candidate[], room)) refuse('box-office.pass.cover-too-many', 'A pass gives one entry at a performance, and some passes only one performance of each show.', { status: 422, remedy: 'Leave out the tickets that would be a second entry.', fields: { cover: 'too-many' } })
  const pass = await first<{ once: number }>('SELECT once FROM box_office_passes WHERE id = ?', passId)
  await switchLines(unit, (tickets as Candidate[]).map(ticket => ({ pass: { id: passId, once: !!pass!.once }, ticket })), by, at)
  return { covered: tickets.length }
}

/**
 * The switch itself, in one batch: each ticket's line becomes the pass's entry where it stands, with
 * the pass's guard on the statement as for any entry; each booking's total comes down by what the
 * tickets cost; a reservation left with nothing to pay is confirmed and its tickets issued, as any
 * order with nothing to pay is; and the booking's holder is told.
 */
async function switchLines(unit: UnitView, items: readonly { pass: { id: string, once: boolean }, ticket: Candidate, coverId?: string }[], by: string | null, at: number): Promise<void> {
  if (!items.length) return
  const names = new Map<string, string>()
  for (const { pass, ticket, coverId } of items) {
    unit.add(sql`UPDATE box_office_passes SET updated_at = ${at} WHERE id = ${pass.id} AND state = 'active' AND (uses_total IS NULL OR uses_taken < uses_total)
      AND NOT EXISTS (SELECT 1 FROM box_office_pass_redemptions d WHERE d.pass_id = ${pass.id} AND d.state = 'live' AND (d.performance_id = ${ticket.performanceId} OR (d.once = 1 AND d.production_id = ${ticket.productionId})))`)
      .expect(1, { code: 'box-office.pass.just-used', reason: 'That pass has just been used for one of these.', remedy: 'Reload to see what it can still cover.' })
    const entryId = newId('pred')
    unit.add(sql`INSERT INTO box_office_pass_redemptions (id, pass_id, production_id, performance_id, order_id, claim_id, once, state, created_at, updated_at)
      VALUES (${entryId}, ${pass.id}, ${ticket.productionId}, ${ticket.performanceId}, ${ticket.orderId}, ${ticket.claimId}, ${pass.once ? 1 : 0}, 'live', ${at}, ${at})`)
    // The line keeps its seat, ticket type and ticket: the pass covers the whole of its price.
    unit.add(sql`UPDATE box_office_order_lines SET discount_minor = list_minor, amount_minor = 0, pass_redemption_id = ${entryId}, updated_at = ${at}
      WHERE id = ${ticket.lineId} AND state = 'live' AND pass_redemption_id IS NULL AND amount_minor = ${ticket.amountMinor}`).expect(1, CHANGED)
    if (coverId) unit.add(sql`UPDATE box_office_pass_covers SET state = 'applied', updated_at = ${at} WHERE id = ${coverId} AND state = 'held'`).expect(1, CHANGED)
    else unit.insertSet(passCovers, [{ passId: pass.id, lineId: ticket.lineId, orderId: ticket.orderId, wasMinor: ticket.amountMinor, creditMinor: 0, refundMinor: 0, state: 'applied', by }])
    if (!names.has(pass.id)) names.set(pass.id, (await first<{ name: string }>('SELECT t.name FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id WHERE p.id = ?', pass.id))!.name)
  }

  const orders = new Map<string, typeof items[number][]>()
  for (const item of items) orders.set(item.ticket.orderId, [...(orders.get(item.ticket.orderId) ?? []), item])
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  for (const [orderId, list] of orders) {
    const order = (await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId))!
    const offMinor = list.reduce((sum, i) => sum + i.ticket.amountMinor, 0)
    const totalMinor = order.total_minor - offMinor
    unit.add(sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${orderId} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, CHANGED)
    if (totalMinor === 0) {
      // Nothing is left to pay: confirmed now, its tickets issued and sent, as any free booking is.
      const lines = (await liveLines(orderId)).map(l => list.some(i => i.ticket.lineId === l.id) ? { ...l, amount_minor: 0 } : l)
      await confirmOrder(unit, { ...order, total_minor: 0 }, lines, { from: 'reserved' })
    }
    if (!order.account_id) continue
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(totalMinor / 100) // not-policy: minor units to units
    const when = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: await theatreTimeZone() })
    await notify(unit, 'box-office.pass-covered', {
      to: order.account_id,
      variables: {
        pass: [...new Set(list.map(i => names.get(i.pass.id)!))].join(' and '),
        tickets: list.map(i => `${i.ticket.ticket} for ${i.ticket.show}, ${when.format(i.ticket.startsAt)}`).join('; '),
        reference: order.reference,
        money: totalMinor === 0 ? 'There is nothing to pay on this booking now, and your tickets are on their way.' : `There is ${money} left to pay on this booking, at the box office.`,
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
