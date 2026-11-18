// Letting seats go (Box office specification, part 3: "basket to expired" and "reserved to
// expired"; R-6). A basket whose hold has lapsed holds nothing: the sweep expires it and clears the
// address it may have been waiting to confirm. A reservation nobody has paid for is released at the
// time the theatre set before the start, or by hand, unless staff marked it to keep; one being paid
// at that moment is not reserved, so it is never touched. Each order is its own batch.
import { sql } from 'drizzle-orm'
import { all, first, nowMs, refuse, type UnitView } from '#kit'
import { notify } from '#modules/core'
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
    WHERE state = 'confirmed' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${orderId})`).expect(lines.length, not)
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
