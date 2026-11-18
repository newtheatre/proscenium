// Letting seats go (Box office specification, part 3: "basket to expired" and "reserved to
// expired"; R-6). A basket whose hold has lapsed holds nothing: the sweep expires it and clears the
// address it may have been waiting to confirm. A reservation nobody has paid for is released at the
// time the theatre set before the start, or by hand, unless staff marked it to keep; one being paid
// at that moment is not reserved, so it is never touched. Each order is its own batch.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { getPerformance, notify } from '#modules/core'
import { claimSeats } from './capacity'
import { hashOf } from './codes'
import { liveLines, ORDER, wordsFor, type OrderRow } from './orders'

const BATCH = 50 // not-policy: orders handled in one run of a task

/** Baskets whose hold has lapsed, oldest first. */
export async function lapsedBaskets(at = nowMs()): Promise<string[]> {
  return (await all<{ id: string }>(`SELECT id FROM box_office_orders WHERE state = 'basket' AND expires_at <= ? ORDER BY expires_at LIMIT ${BATCH}`, at)).map(r => r.id)
}

/** Expires one lapsed basket. Its claims may have been released already by a sale that needed the room. */
export function expireBasket(unit: UnitView, orderId: string, at = nowMs()): void {
  unit.add(sql`UPDATE box_office_orders SET state = 'expired', updated_at = ${at},
      confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_email = NULL, confirm_name = NULL
    WHERE id = ${orderId} AND state = 'basket' AND expires_at <= ${at}`)
    .expect(1, { code: 'box-office.basket.not-lapsed', reason: 'This basket has not lapsed.' })
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'expired'
    WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${orderId} AND kind = 'basket')`)
  unit.announce('box-office.order.expired', { orderId }, { record: ['box-office.order', orderId] })
}

/**
 * The buyer lets their basket go before it lapses ("Cancel and release", or holding new tickets in
 * its place): its seats go back on sale now, and it reads as expired. Letting go of a basket that has
 * already gone is no error.
 */
export async function abandonBasket(unit: UnitView, orderId: string, token: string, at = nowMs()): Promise<{ state: 'expired' }> {
  const order = await first<{ state: string }>('SELECT state FROM box_office_orders WHERE id = ? AND basket_token_hash = ?', orderId, await hashOf(token))
  if (!order) refuse('box-office.basket.not-found', 'There is no such basket.', { status: 404 })
  if (order.state === 'expired') return { state: 'expired' }
  if (order.state !== 'basket') refuse('box-office.basket.not-a-basket', 'These tickets are no longer in a basket.', { status: 409, remedy: 'Your booking\'s own page says what you can change.' })
  unit.add(sql`UPDATE box_office_orders SET state = 'expired', expires_at = ${at}, updated_at = ${at},
      confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_email = NULL, confirm_name = NULL
    WHERE id = ${orderId} AND state = 'basket'`)
    .expect(1, { code: 'box-office.basket.not-a-basket', reason: 'These tickets are no longer in a basket.' })
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'abandoned'
    WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${orderId} AND kind = 'basket')`)
  unit.announce('box-office.order.expired', { orderId }, { record: ['box-office.order', orderId] })
  return { state: 'expired' }
}

/** Reservations whose release time has come: not marked to keep, and not being paid for now. */
export async function dueReservations(at = nowMs()): Promise<string[]> {
  return (await all<{ id: string }>(`SELECT id FROM box_office_orders WHERE state = 'reserved' AND keep = 0 AND release_at <= ? ORDER BY release_at LIMIT ${BATCH}`, at)).map(r => r.id)
}

/**
 * Releases one reservation: its seats go back on sale and the buyer is told. `by` is 'task' at the
 * release time, which leaves alone an order marked to keep or not yet due, or 'staff' by hand.
 */
export async function releaseReservation(unit: UnitView, orderId: string, by: 'task' | 'staff'): Promise<void> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  const not = { code: 'box-office.order.not-reserved', reason: 'This order is not a reservation waiting to be paid for.', remedy: 'Reload to see what became of it.' }
  if (order.state !== 'reserved') refuse(not.code, not.reason, { status: 409, remedy: not.remedy })
  const lines = await liveLines(orderId)
  const at = nowMs()
  unit.add(sql`UPDATE box_office_orders SET state = 'expired', release_at = NULL, updated_at = ${at}
    WHERE id = ${orderId} AND state = 'reserved' AND ${by === 'task' ? sql`keep = 0 AND release_at <= ${at}` : sql`TRUE`}`).expect(1, not)
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = ${by === 'task' ? 'expired' : 'staff'}
    WHERE state = 'confirmed' AND displaced_for_id IS NULL AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${orderId})`).expect(lines.length, not)
  unit.announce('box-office.order.expired', { orderId }, { record: ['box-office.order', orderId] })
  if (by === 'staff') unit.audit({ action: 'release', record: ['box-office.order', orderId] })
  const words = await wordsFor(order, lines, order.total_minor)
  await notify(unit, 'box-office.reservation-released', {
    to: order.account_id!,
    variables: { reference: order.reference, show: words.show, when: words.when },
    subject: ['box-office.order', orderId],
    dedupeKey: `released:${orderId}`,
  })
}

/** Staff mark a reservation to keep (a known latecomer), or take the mark off. */
export function keepReservation(unit: UnitView, orderId: string, keep: boolean): void {
  unit.add(sql`UPDATE box_office_orders SET keep = ${keep}, updated_at = ${nowMs()} WHERE id = ${orderId} AND state = 'reserved'`)
    .expect(1, { code: 'box-office.order.not-reserved', reason: 'This order is not a reservation waiting to be paid for.' })
  unit.audit({ action: keep ? 'keep' : 'unkeep', record: ['box-office.order', orderId] })
}

/**
 * The unpaid reservations for a performance that the door can let go now: reserved, not marked to
 * keep, and not being paid for at this moment.
 */
export async function unpaidFor(performanceId: string): Promise<string[]> {
  return (await all<{ id: string }>(`SELECT DISTINCT o.id FROM box_office_orders o JOIN box_office_order_lines l ON l.order_id = o.id
    WHERE o.state = 'reserved' AND o.keep = 0 AND l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY o.id`, performanceId)).map(r => r.id)
}

const NOT_RELEASED = { code: 'box-office.order.not-released', reason: 'This booking was not a reservation released unpaid.', remedy: 'Reload to see what became of it.' }

/**
 * Seats someone whose unpaid reservation was released, when they turn up after all (Matt,
 * 2026-11-18): the same booking, reference and prices, reserved again on seats taken through the
 * ordinary claim, so it is refused when the house has filled. It is then kept, so the release does
 * not take it again before they pay. A line keeps its claim, so the tickets are new lines and the old
 * ones are marked moved on, as an exchange's are.
 */
export async function reinstateReservation(unit: UnitView, orderId: string, by: string | null): Promise<{ orderId: string, reference: string }> {
  const order = await first<{ id: string, reference: string, state: string, reserved_at: number | null }>('SELECT id, reference, state, reserved_at FROM box_office_orders WHERE id = ?', orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  const lines = await all<{ id: string, pool_id: string, performance_id: string, release_reason: string | null }>(
    `SELECT l.id, c.pool_id, l.performance_id, c.release_reason FROM box_office_order_lines l JOIN box_office_claims c ON c.id = l.claim_id
      WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, orderId)
  if (order.state !== 'expired' || order.reserved_at === null || !lines.length || lines.some(l => l.release_reason !== 'expired' && l.release_reason !== 'staff'))
    refuse(NOT_RELEASED.code, NOT_RELEASED.reason, { status: 409, remedy: NOT_RELEASED.remedy })
  const performance = await getPerformance(lines[0]!.performance_id)
  const until = performance.startsAt + (await useSetting('box-office.sales.desk-until-after') as number) * 1000 // not-policy: seconds to milliseconds
  const at = nowMs()
  if (performance.state !== 'scheduled' || at >= until) refuse('box-office.sales.closed', 'Sales have closed for this performance.', { status: 409 })
  const hold = await first<{ id: string }>("SELECT id FROM box_office_holds WHERE order_id = ? AND kind = 'reservation'", orderId)
  if (!hold) refuse(NOT_RELEASED.code, NOT_RELEASED.reason, { status: 409, remedy: NOT_RELEASED.remedy })

  unit.add(sql`UPDATE box_office_orders SET state = 'reserved', release_at = NULL, keep = 1, updated_at = ${at}
    WHERE id = ${orderId} AND state = 'expired' AND reserved_at IS NOT NULL`).expect(1, NOT_RELEASED)
  const claimed = (await claimSeats(unit, { holdId: hold.id, requests: lines.map(l => ({ poolId: l.pool_id, quantity: 1 })), state: 'confirmed', expiresAt: null })).flat()
  const ids = JSON.stringify(lines.map(l => l.id))
  unit.add(sql`UPDATE box_office_order_lines SET state = 'exchanged', updated_at = ${at}
    WHERE order_id = ${orderId} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(lines.length, NOT_RELEASED)
  lines.forEach((line, i) => {
    // A promo code's use went back with the seat, so the discount stays and the use is not taken again.
    unit.add(sql`INSERT INTO box_office_order_lines (id, order_id, kind, performance_id, band_id, ticket_type_id, claim_id, price_id, list_minor, discount_minor, amount_minor, pass_redemption_id, comp_request_id, requirement_ref, requirement_account_id, requirement_evidence_id, state, created_at, updated_at)
      SELECT ${newId('orl')}, order_id, kind, performance_id, band_id, ticket_type_id, ${claimed[i]}, price_id, list_minor, discount_minor, amount_minor, pass_redemption_id, comp_request_id, requirement_ref, requirement_account_id, requirement_evidence_id, 'live', ${at}, ${at}
        FROM box_office_order_lines WHERE id = ${line.id}`).expect(1, NOT_RELEASED)
  })
  unit.audit({ action: 'update', record: ['box-office.order', orderId], detail: { reinstated: lines.length, by } })
  return { orderId, reference: order.reference }
}
