// Complimentary tickets (Box office specification, part 4, "Complimentary tickets"; BO-62, BO-63).
// Someone with `box-office.comp.request` on a performance asks for a number of tickets in one band,
// for a named person and a reason from the theatre's list. Approving issues them in the same batch:
// a confirmed order of zero-price tickets on the theatre's complimentary ticket type, sent to the
// person, scanned and counted like any other ticket. Nobody decides their own request: the ability
// refuses the owner and a CHECK refuses the row.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, inAccountScope, newId, nowMs, refuse, requireAbility, useContext, useDb, useSetting, type UnitView } from '#kit'
import { findOrCreateAccount, getPerformance, getTerm } from '#modules/core'
import { claimSeats } from './capacity'
import { newReference } from './codes'
import { confirmOrder, type Confirmed } from './confirm'
import { orderLines } from './db/schema'
import { liveLines, ORDER, type LineRow, type OrderRow } from './orders'
import { pricesFor } from './prices'
import { poolsOf } from './setup'
import { ensureManagedTicketTypes, managedType } from './ticket-types'

const REASONS = 'box-office.comp-reason'
const HOLD = 60_000 // not-policy: the batch confirms the order it opens; the expiry only has to be in the future
const CHANGED = { code: 'box-office.comp.changed', reason: 'This request has just been decided or withdrawn.', remedy: 'Reload to see where it stands.' }

export type CompState = 'requested' | 'approved' | 'declined' | 'issued' | 'withdrawn'

export interface CompRow {
  id: string
  performance_id: string
  band_id: string
  quantity: number
  for_account_id: string
  reason_term_id: string
  requested_by: string
  state: CompState
  decided_by: string | null
  decided_at: number | null
  order_id: string | null
  created_at: number
}

export interface CompRequestInput {
  performanceId: string
  /** Left out, the band with most seats free is taken: whoever asks rarely knows the house. */
  bandId?: string
  quantity: number
  /** Who the tickets are for. An address nobody holds makes an unclaimed account for them. */
  email: string
  name?: string | null
  reasonTermId: string
}

const COMP = 'SELECT id, performance_id, band_id, quantity, for_account_id, reason_term_id, requested_by, state, decided_by, decided_at, order_id, created_at FROM box_office_comp_requests'

export function compById(id: string): Promise<CompRow | null> {
  return first<CompRow>(`${COMP} WHERE id = ?`, id)
}

/** Requests matching a condition, newest first, a page's worth. */
export function compsWhere(where: SQL): Promise<CompRow[]> {
  return useDb().all<CompRow>(sql`${sql.raw(COMP)} WHERE ${where} ORDER BY created_at DESC LIMIT 200`) // not-policy: a page's worth
}

/** Adds a request to the unit and says its id. */
export async function requestComps(unit: UnitView, input: CompRequestInput): Promise<{ requestId: string, issued: boolean }> {
  const actor = useContext().actor
  if (!actor.accountId) refuse('box-office.comp.signed-out', 'Sign in to ask for complimentary tickets.', { status: 401 })
  const performance = await getPerformance(input.performanceId)
  if (performance.state === 'cancelled') refuse('box-office.comp.cancelled', 'This performance is cancelled.', { status: 409 })
  if (performance.startsAt <= nowMs()) refuse('box-office.comp.started', 'This performance has already started.', { status: 409, fields: { performanceId: 'invalid' }, remedy: 'Choose a later performance.' })
  const pools = await poolsOf(input.performanceId)
  // Any seats: the band with most room for them, which the approver sees on the request.
  const bandId = input.bandId || [...pools].sort((a, b) => (b.capacity - b.claimed) - (a.capacity - a.claimed))[0]?.bandId
  if (!bandId || !pools.some(p => p.bandId === bandId))
    refuse('box-office.comp.bad-band', 'That band is not on sale for this performance.', { status: 422, fields: { bandId: 'invalid' } })
  const most = await useSetting('box-office.comps.per-request') as number
  if (input.quantity > most) refuse('box-office.comp.too-many', `At most ${most} complimentary tickets in one request.`, { status: 422, fields: { quantity: 'too-many' }, remedy: 'Ask for fewer, or make a second request.' })
  const term = await getTerm(input.reasonTermId)
  if (!term || term.vocabularyKey !== REASONS || term.retired)
    refuse('box-office.comp.bad-reason', 'That reason is not on the list of reasons for complimentary tickets.', { status: 422, fields: { reasonTermId: 'invalid' }, remedy: 'Choose a reason from the list.' })

  const { accountId } = await findOrCreateAccount(unit, { address: input.email, name: input.name, origin: 'named-by-other' })
  const at = nowMs()
  const requestId = newId('comp')
  unit.add(sql`INSERT INTO box_office_comp_requests (id, performance_id, band_id, quantity, for_account_id, reason_term_id, requested_by, state, created_at, updated_at)
    VALUES (${requestId}, ${input.performanceId}, ${bandId}, ${input.quantity}, ${accountId}, ${input.reasonTermId}, ${actor.accountId}, 'requested', ${at}, ${at})`)
  unit.announce('box-office.comp-request.requested', { requestId }, { record: ['box-office.comp-request', requestId] })
  // With no approval needed, the tickets are issued in the same batch, decided by nobody.
  if (!await useSetting('box-office.comps.needs-approval')) {
    await issueComps(unit, { id: requestId, performance_id: input.performanceId, band_id: bandId, quantity: input.quantity, for_account_id: accountId, order_id: null }, null)
    return { requestId, issued: true }
  }
  return { requestId, issued: false }
}

/**
 * Approves a request and issues its tickets in the same batch. The performance's approved total stays
 * within `box-office.comps.per-performance`, checked by the statement that approves, so two approvals
 * at once cannot pass the cap between them.
 */
export async function approveComps(unit: UnitView, requestId: string): Promise<Confirmed> {
  const request = await compById(requestId)
  if (!request) refuse('box-office.comp.not-found', 'There is no such request.', { status: 404 })
  if (request.state !== 'requested') refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  return issueComps(unit, request, useContext().actor.accountId ?? null)
}

/** Approves a request still asked for, in the unit, and issues its tickets. */
async function issueComps(unit: UnitView, request: Pick<CompRow, 'id' | 'performance_id' | 'band_id' | 'quantity' | 'for_account_id' | 'order_id'>, decidedBy: string | null): Promise<Confirmed> {
  const requestId = request.id
  if (request.order_id) return convertReservation(unit, { ...request, order_id: request.order_id }, await compType(), decidedBy)
  const at = nowMs()
  await approveWithinCap(unit, request, decidedBy, at)
  const confirmed = await issueCompOrder(unit, { performanceId: request.performance_id, bandId: request.band_id, quantity: request.quantity, accountId: request.for_account_id, compRequestId: requestId })
  unit.add(sql`UPDATE box_office_comp_requests SET state = 'issued', order_id = ${confirmed.orderId}, updated_at = ${at} WHERE id = ${requestId} AND state = 'approved'`).expect(1, CHANGED)
  unit.announce('box-office.comp-request.decided', { requestId, state: 'issued' }, { record: ['box-office.comp-request', requestId] })
  return confirmed
}

export interface CompOrder { performanceId: string, bandId: string, quantity: number, accountId: string, compRequestId?: string | null }

/**
 * A confirmed order of zero-price tickets on the complimentary type, claimed from one band's pool in
 * the unit, so a sold-out band refuses the whole batch. Comp requests and Companies' guests (BO-75) use it.
 */
export async function issueCompOrder(unit: UnitView, request: CompOrder): Promise<Confirmed> {
  const actor = useContext().actor
  const type = await compType()
  const pool = (await poolsOf(request.performanceId)).find(p => p.bandId === request.bandId)
  if (!pool) refuse('box-office.comp.bad-band', 'That band is no longer on sale for this performance.', { status: 409 })
  const at = nowMs()
  // Nothing is charged: the currency is the performance's, for the order's money columns.
  const currency = (await pricesFor(request.performanceId, at))[0]?.currency ?? 'GBP'
  const orderId = newId('ord')
  const holdId = newId('hold')
  const order: OrderRow = {
    id: orderId, reference: newReference(), state: 'basket', account_id: request.accountId, currency, total_minor: 0, expires_at: at + HOLD,
    release_at: null, intent_id: null, confirm_email: null, confirm_name: null, booked_with: null, admit_on_payment: 0, sold_by: actor.accountId ?? null,
  }
  unit.add(sql`INSERT INTO box_office_orders (id, reference, channel, state, account_id, signed_in, currency, total_minor, sold_by, expires_at, keep, created_at, updated_at)
    VALUES (${orderId}, ${order.reference}, 'desk', 'basket', ${request.accountId}, 0, ${currency}, 0, ${order.sold_by}, ${order.expires_at}, 0, ${at}, ${at})`)
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'basket', ${orderId}, ${actor.accountId ?? null}, ${at}, ${at})`)
  const claimed = (await claimSeats(unit, { holdId, requests: [{ poolId: pool.id, quantity: request.quantity }], expiresAt: order.expires_at })).flat()
  const lineIds = unit.insertSet(orderLines, claimed.map(claimId => ({
    orderId, kind: 'ticket', performanceId: request.performanceId, bandId: request.bandId, ticketTypeId: type.id, claimId, listMinor: 0, discountMinor: 0, amountMinor: 0, compRequestId: request.compRequestId ?? null, state: 'live',
  })))
  unit.expect(claimed.length)
  const lines: LineRow[] = lineIds.map(id => ({ id, performance_id: request.performanceId, band_id: request.bandId, ticket_type_id: type.id, amount_minor: 0, type_name: type.name, type_kind: 'complimentary', band_name: null }))
  return confirmOrder(unit, order, lines, { from: 'basket', account: { id: request.accountId, signedIn: false } })
}

/** Declines a request (by an approver) or withdraws it (by the requester). */
export async function closeComps(unit: UnitView, request: CompRow, as: 'declined' | 'withdrawn'): Promise<void> {
  const actor = useContext().actor
  if (request.state !== 'requested') refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  const at = nowMs()
  if (as === 'withdrawn') {
    const own = actor.accountId ? await useDb().get(sql`SELECT 1 AS one FROM box_office_comp_requests WHERE id = ${request.id} AND ${inAccountScope('requested_by', actor.accountId)}`) : null
    if (!own) refuse('box-office.comp.not-yours', 'Only the person who asked can withdraw a request.', { status: 403 })
    unit.add(sql`UPDATE box_office_comp_requests SET state = 'withdrawn', updated_at = ${at} WHERE id = ${request.id} AND state = 'requested'`).expect(1, CHANGED)
  }
  else {
    unit.add(sql`UPDATE box_office_comp_requests SET state = 'declined', decided_by = ${actor.accountId ?? null}, decided_at = ${at}, updated_at = ${at}
      WHERE id = ${request.id} AND state = 'requested'`).expect(1, CHANGED)
  }
  unit.announce('box-office.comp-request.decided', { requestId: request.id, state: as }, { record: ['box-office.comp-request', request.id] })
}

/** Box office keeps its own Complimentary type; it is made here if this site has not listed its types yet. */
async function compType(): Promise<{ id: string, name: string }> {
  await ensureManagedTicketTypes()
  const type = await managedType('box-office.complimentary')
  if (!type) refuse('box-office.comp.no-type', 'The Complimentary ticket type has been retired, so there is nothing to issue them on.', { status: 409, remedy: 'Bring it back on the Ticket types screen.' })
  return type
}

/** Approves the request, keeping the performance within `box-office.comps.per-performance` in the same statement. */
async function approveWithinCap(unit: UnitView, request: Pick<CompRow, 'id' | 'performance_id'>, decidedBy: string | null, at: number): Promise<void> {
  const cap = await useSetting('box-office.comps.per-performance') as number | null
  const over = { code: 'box-office.comp.over-cap', reason: `Approving these would take this performance past its ${cap ?? 0} complimentary tickets.`, remedy: 'Decline it, or raise the limit in the box office settings.' }
  unit.add(sql`UPDATE box_office_comp_requests SET state = 'approved', decided_by = ${decidedBy}, decided_at = ${at}, updated_at = ${at}
    WHERE id = ${request.id} AND state = 'requested'
      AND (${cap} IS NULL OR quantity + (SELECT coalesce(sum(quantity), 0) FROM box_office_comp_requests
        WHERE performance_id = ${request.performance_id} AND state IN ('approved', 'issued') AND id <> ${request.id}) <= ${cap})`).expect(1, cap === null ? CHANGED : over)
}

const GONE = { code: 'box-office.comp.reservation-gone', reason: 'This reservation has been paid for, changed, released or cancelled since it was asked to be made complimentary.', remedy: 'Decline the request, and ask again if it is still wanted.' }

/** A reservation that can become complimentary: still unpaid, only tickets, and nothing a pass rides on. */
async function convertible(orderId: string): Promise<{ order: OrderRow, lines: LineRow[] }> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'reserved') refuse('box-office.desk.not-reserved', 'This order is not a reservation waiting to be paid for.', { status: 409 })
  if (!order.account_id) refuse('box-office.comp.no-buyer', 'This reservation has nobody to send complimentary tickets to.', { status: 409 })
  const lines = await liveLines(order.id)
  const other = await first<{ one: number }>('SELECT 1 AS one FROM box_office_order_lines WHERE order_id = ? AND state = \'live\' AND (kind <> \'ticket\' OR pass_redemption_id IS NOT NULL OR comp_request_id IS NOT NULL) LIMIT 1', order.id)
  const covered = await first<{ one: number }>(`SELECT 1 AS one FROM box_office_pass_covers WHERE state IN ('held', 'applied')
    AND (order_id = ? OR line_id IN (SELECT id FROM box_office_order_lines WHERE order_id = ?)) LIMIT 1`, order.id, order.id)
  if (!lines.length || other || covered)
    refuse('box-office.comp.reservation-mixed', 'Only a reservation of tickets alone can be made complimentary: this one has a pass or something else on it.', { status: 409, remedy: 'Split the tickets off into a reservation of their own first, or cancel it and ask for complimentary tickets instead.' })
  return { order, lines }
}

/**
 * Asks for a reservation not yet paid for to become complimentary tickets, keeping its seats
 * (Matt, 2026-11-19). It is a request like any other, for the reservation's buyer and every ticket on
 * it, decided by someone else where the theatre needs approval; until then the reservation stands.
 */
export async function requestReservationComps(unit: UnitView, orderId: string, reasonTermId: string): Promise<{ requestId: string, issued: boolean, reference: string }> {
  const actor = useContext().actor
  if (!actor.accountId) refuse('box-office.comp.signed-out', 'Sign in to ask for complimentary tickets.', { status: 401 })
  const { order, lines } = await convertible(orderId)
  const performanceId = lines[0]!.performance_id
  await requireAbility(actor, 'box-office.comp.request', ['core.performance', performanceId])
  const performance = await getPerformance(performanceId)
  if (performance.state === 'cancelled') refuse('box-office.comp.cancelled', 'This performance is cancelled.', { status: 409 })
  const most = await useSetting('box-office.comps.per-request') as number
  if (lines.length > most) refuse('box-office.comp.too-many', `At most ${most} complimentary tickets in one request.`, { status: 422, remedy: 'Split some tickets off into a reservation of their own, and make each complimentary.' })
  const term = await getTerm(reasonTermId)
  if (!term || term.vocabularyKey !== REASONS || term.retired)
    refuse('box-office.comp.bad-reason', 'That reason is not on the list of reasons for complimentary tickets.', { status: 422, fields: { reasonTermId: 'invalid' }, remedy: 'Choose a reason from the list.' })

  const at = nowMs()
  const requestId = newId('comp')
  const pending = { code: 'box-office.comp.already-asked', reason: 'This reservation is already waiting to be made complimentary.', remedy: 'Wait for the request to be decided, or withdraw it on the Complimentary tickets screen.' }
  // The band named is the one most of its tickets are in: the request shows one, and every seat stays as it is.
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l.band_id, (counts.get(l.band_id) ?? 0) + 1)
  const bandId = [...counts].sort((a, b) => b[1] - a[1])[0]![0]
  unit.add(sql`INSERT INTO box_office_comp_requests (id, performance_id, band_id, quantity, for_account_id, reason_term_id, requested_by, state, order_id, created_at, updated_at)
    SELECT ${requestId}, ${performanceId}, ${bandId}, ${lines.length}, ${order.account_id}, ${reasonTermId}, ${actor.accountId}, 'requested', ${order.id}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_comp_requests WHERE order_id = ${order.id} AND state IN ('requested', 'approved'))`).expect(1, pending)
  unit.announce('box-office.comp-request.requested', { requestId }, { record: ['box-office.comp-request', requestId] })
  if (!await useSetting('box-office.comps.needs-approval')) {
    await issueComps(unit, { id: requestId, performance_id: performanceId, band_id: bandId, quantity: lines.length, for_account_id: order.account_id!, order_id: order.id }, null)
    return { requestId, issued: true, reference: order.reference }
  }
  return { requestId, issued: false, reference: order.reference }
}

/** Approves a request to make a reservation complimentary: its tickets become free ones on the same seats, and it is confirmed and sent. */
async function convertReservation(unit: UnitView, request: Pick<CompRow, 'id' | 'performance_id' | 'quantity'> & { order_id: string }, type: { id: string, name: string }, decidedBy: string | null): Promise<Confirmed> {
  const { order, lines } = await convertible(request.order_id).catch((e: unknown) => {
    if ((e as { code?: string }).code === 'box-office.order.not-found') throw e
    return refuse(GONE.code, GONE.reason, { status: 409, remedy: GONE.remedy })
  })
  if (lines.length !== request.quantity) refuse(GONE.code, GONE.reason, { status: 409, remedy: GONE.remedy })
  const at = nowMs()
  await approveWithinCap(unit, request, decidedBy, at)
  unit.add(sql`UPDATE box_office_order_lines SET ticket_type_id = ${type.id}, price_id = NULL, list_minor = 0, discount_minor = 0, amount_minor = 0, comp_request_id = ${request.id}, updated_at = ${at}
    WHERE order_id = ${order.id} AND kind = 'ticket' AND state = 'live' AND pass_redemption_id IS NULL AND comp_request_id IS NULL`).expect(lines.length, GONE)
  // Nothing was paid on a reservation, so no money moves: it is confirmed at nothing, as a free order is.
  unit.add(sql`UPDATE box_office_orders SET total_minor = 0, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, GONE)
  const free: LineRow[] = lines.map(l => ({ ...l, ticket_type_id: type.id, amount_minor: 0, type_name: type.name, type_kind: 'complimentary' }))
  const confirmed = await confirmOrder(unit, { ...order, total_minor: 0 }, free, { from: 'reserved' })
  unit.add(sql`UPDATE box_office_comp_requests SET state = 'issued', updated_at = ${at} WHERE id = ${request.id} AND state = 'approved'`).expect(1, CHANGED)
  unit.announce('box-office.comp-request.decided', { requestId: request.id, state: 'issued' }, { record: ['box-office.comp-request', request.id] })
  return confirmed
}

/**
 * Makes some tickets on a reservation complimentary from the till's swap menu (Matt, 2026-11-19): a
 * request for those tickets, issued at once where the theatre needs no approval, on the same seats.
 */
export async function compReservationLines(unit: UnitView, orderId: string, lineIds: string[], reasonTermId: string): Promise<{ requestId: string, totalMinor: number }> {
  const actor = useContext().actor
  if (!actor.accountId) refuse('box-office.comp.signed-out', 'Sign in to ask for complimentary tickets.', { status: 401 })
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'reserved') refuse('box-office.desk.not-reserved', 'This order is not a reservation waiting to be paid for.', { status: 409 })
  if (!order.account_id) refuse('box-office.comp.no-buyer', 'This reservation has nobody to send complimentary tickets to.', { status: 409 })
  const ids = JSON.stringify([...new Set(lineIds)])
  const lines = await all<{ id: string, performance_id: string, band_id: string, amount_minor: number }>(
    `SELECT id, performance_id, band_id, amount_minor FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' AND state = 'live'
      AND pass_redemption_id IS NULL AND comp_request_id IS NULL AND id IN (SELECT value FROM json_each(?))`, order.id, ids)
  if (!lines.length || lines.length !== JSON.parse(ids).length) refuse(GONE.code, 'Those tickets are not on this reservation any more, or are free already.', { status: 409, remedy: 'Find the booking again.' })
  const performanceId = lines[0]!.performance_id
  await requireAbility(actor, 'box-office.comp.request', ['core.performance', performanceId])
  if (await useSetting('box-office.comps.needs-approval'))
    refuse('box-office.comp.needs-approval', 'Complimentary tickets need approval here, so they cannot be given at the till.', { status: 409, remedy: 'Ask for them from the booking\'s page.' })
  const term = await getTerm(reasonTermId)
  if (!term || term.vocabularyKey !== REASONS || term.retired)
    refuse('box-office.comp.bad-reason', 'That reason is not on the list of reasons for complimentary tickets.', { status: 422, fields: { reasonTermId: 'invalid' }, remedy: 'Choose a reason from the list.' })
  const type = await compType()
  const at = nowMs()
  const requestId = newId('comp')
  unit.add(sql`INSERT INTO box_office_comp_requests (id, performance_id, band_id, quantity, for_account_id, reason_term_id, requested_by, state, order_id, created_at, updated_at)
    VALUES (${requestId}, ${performanceId}, ${lines[0]!.band_id}, ${lines.length}, ${order.account_id}, ${reasonTermId}, ${actor.accountId}, 'requested', ${order.id}, ${at}, ${at})`)
  unit.announce('box-office.comp-request.requested', { requestId }, { record: ['box-office.comp-request', requestId] })
  await approveWithinCap(unit, { id: requestId, performance_id: performanceId }, null, at)
  unit.add(sql`UPDATE box_office_order_lines SET ticket_type_id = ${type.id}, price_id = NULL, list_minor = 0, discount_minor = 0, amount_minor = 0, comp_request_id = ${requestId}, updated_at = ${at}
    WHERE order_id = ${order.id} AND state = 'live' AND comp_request_id IS NULL AND id IN (SELECT value FROM json_each(${ids}))`).expect(lines.length, GONE)
  const totalMinor = order.total_minor - lines.reduce((sum, l) => sum + l.amount_minor, 0)
  unit.add(sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE id = ${order.id} AND state = 'reserved' AND total_minor = ${order.total_minor}`).expect(1, GONE)
  unit.add(sql`UPDATE box_office_comp_requests SET state = 'issued', updated_at = ${at} WHERE id = ${requestId} AND state = 'approved'`).expect(1, CHANGED)
  unit.announce('box-office.comp-request.decided', { requestId, state: 'issued' }, { record: ['box-office.comp-request', requestId] })
  return { requestId, totalMinor }
}
