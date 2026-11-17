// Cancelling, rescheduling or moving a performance with tickets (BO-52, BO-53; Box office
// specification, part 3, "Cancelling, rescheduling or moving a performance with tickets", and
// integration ruling R-11). The core asks every module before it changes a performance. Box office
// refuses while the performance has bookings and nobody has decided what happens to them, and its
// refusal links to the Bulk cancellation screen, where a box office manager records the decision:
// refund everyone, offer an exchange, or keep the bookings (never for a cancellation). When the
// core's change goes through, its event carries the decision out: refunds are one job per booking,
// so one that fails is listed and retried without holding up the rest. Box office never refunds
// without that decision. A decision is used once and then cleared, so the next change asks again.
import { sql } from 'drizzle-orm'
import { all, first, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { getPerformance, notify } from '#modules/core'
import { cancelLines } from './cancel'
import { liveLines, ORDER, wordsFor, type OrderRow } from './orders'

export type Decision = 'refund_all' | 'offer_exchange' | 'keep'
export type ChangeKind = 'cancel' | 'reschedule' | 'move'

/** The bookings a change to a performance would touch. */
export interface Affected {
  /** Paid bookings and those being paid for. */
  bookings: number
  tickets: number
  paidMinor: number
  /** Reservations not yet paid for: cancelled with the performance whatever is decided. */
  reservations: number
  reservedTickets: number
  currency: string | null
  decision: Decision | null
  decidedAt: number | null
}

const STATES = "('reserved', 'awaiting_payment', 'confirmed')"

export async function affected(performanceId: string): Promise<Affected> {
  const rows = await all<{ state: string, orders: number, tickets: number, money: number, currency: string }>(
    `SELECT o.state, count(DISTINCT o.id) AS orders, count(l.id) AS tickets, coalesce(sum(l.amount_minor), 0) AS money, max(o.currency) AS currency
      FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id
      WHERE l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live' AND o.state IN ${STATES} GROUP BY o.state`, performanceId)
  const sales = await first<{ change_decision: Decision | null, change_decided_at: number | null }>('SELECT change_decision, change_decided_at FROM box_office_performance_sales WHERE performance_id = ?', performanceId)
  const paid = rows.filter(r => r.state !== 'reserved')
  const reserved = rows.find(r => r.state === 'reserved')
  return {
    bookings: paid.reduce((sum, r) => sum + r.orders, 0),
    tickets: paid.reduce((sum, r) => sum + r.tickets, 0),
    paidMinor: paid.reduce((sum, r) => sum + r.money, 0),
    reservations: reserved?.orders ?? 0,
    reservedTickets: reserved?.tickets ?? 0,
    currency: rows[0]?.currency ?? null,
    decision: sales?.change_decision ?? null,
    decidedAt: sales?.change_decided_at ?? null,
  }
}

/** Records what happens to the bookings when the performance next changes. */
export async function decide(unit: UnitView, performanceId: string, decision: Decision, by: string): Promise<void> {
  const sales = await first<{ id: string }>('SELECT id FROM box_office_performance_sales WHERE performance_id = ?', performanceId)
  if (!sales) refuse('box-office.change.nothing-sold', 'Nothing has been sold for this performance, so there is nothing to decide.', { status: 409 })
  const at = nowMs()
  unit.add(sql`UPDATE box_office_performance_sales SET change_decision = ${decision}, change_decided_by = ${by}, change_decided_at = ${at}, updated_at = ${at} WHERE id = ${sales.id}`).expect(1)
}

/** Box office's answer to the core before a performance is changed. */
export async function guard(change: { record: { type: string, id: string }, kind: string, to?: { capacity?: number | null } }, _actor: Actor) {
  if (change.record.type !== 'core.performance') return { allowed: true as const }
  const performanceId = change.record.id
  if (change.kind === 'capacity') {
    const capacity = change.to?.capacity
    if (capacity === null || capacity === undefined) return { allowed: true as const }
    const claimed = (await first<{ n: number }>('SELECT coalesce(sum(claimed), 0) AS n FROM box_office_pools WHERE performance_id = ?', performanceId))?.n ?? 0
    if (claimed > capacity) return { allowed: false as const, code: 'box-office.change.capacity-below-sold', reason: `${claimed} seats for this performance are sold, reserved or held, more than ${capacity}.` }
    return { allowed: true as const }
  }
  if (change.kind !== 'cancel' && change.kind !== 'reschedule' && change.kind !== 'move') return { allowed: true as const }
  const a = await affected(performanceId)
  if (!a.bookings && !a.reservations) return { allowed: true as const }
  if (a.decision && !(change.kind === 'cancel' && a.decision === 'keep')) return { allowed: true as const }
  const count = a.tickets + a.reservedTickets
  return {
    allowed: false as const,
    code: 'box-office.change.decision-needed',
    reason: `${count === 1 ? '1 ticket is' : `${count} tickets are`} booked or reserved for this performance. Decide what happens to them before it is ${change.kind === 'cancel' ? 'cancelled' : change.kind === 'move' ? 'moved' : 'rescheduled'}.`,
    link: `/console/box-office/performances/${encodeURIComponent(performanceId)}/change?for=${change.kind}`,
  }
}

/** Box office's lines on the core's confirmation of a change. */
export async function impact(change: { record: { type: string, id: string }, kind: string }): Promise<string[]> {
  if (change.record.type !== 'core.performance' || !['cancel', 'reschedule', 'move'].includes(change.kind)) return []
  const a = await affected(change.record.id)
  const lines: string[] = []
  if (a.bookings) lines.push(`${a.tickets === 1 ? '1 ticket' : `${a.tickets} tickets`} on ${a.bookings === 1 ? '1 booking' : `${a.bookings} bookings`}, ${money(a.paidMinor, a.currency)} paid.`)
  if (a.reservations) lines.push(`${a.reservations === 1 ? '1 reservation' : `${a.reservations} reservations`} not yet paid for${change.kind === 'cancel' ? ', which will be cancelled' : ''}.`)
  if (lines.length && a.decision) lines.push(DECIDED[a.decision])
  return lines
}

const DECIDED: Record<Decision, string> = {
  refund_all: 'Box office will cancel and refund every booking.',
  offer_exchange: 'Box office will tell every ticket holder and offer them an exchange or a refund.',
  keep: 'Box office will keep the bookings and tell every ticket holder.',
}

function money(minor: number, currency: string | null): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency ?? 'GBP' }).format(minor / 100) // not-policy: minor units to units; every currency sold here has two decimals
}

/** Bookings with live tickets for a performance, and which of them are paid for. */
async function bookingsFor(performanceId: string): Promise<OrderRow[]> {
  return all<OrderRow>(`${ORDER} WHERE state IN ('reserved', 'confirmed') AND id IN (SELECT order_id FROM box_office_order_lines WHERE performance_id = ? AND kind = 'ticket' AND state = 'live') ORDER BY id`, performanceId)
}

/** Takes the decision and clears it, so the next change asks again. */
async function useDecision(unit: UnitView, performanceId: string): Promise<Decision | null> {
  const sales = await first<{ id: string, change_decision: Decision | null }>('SELECT id, change_decision FROM box_office_performance_sales WHERE performance_id = ?', performanceId)
  if (!sales) return null
  unit.add(sql`UPDATE box_office_performance_sales SET change_decision = NULL, updated_at = ${nowMs()} WHERE id = ${sales.id}`)
  return sales.change_decision
}

/**
 * core.performance.cancelled: sales stop; every reservation is cancelled; paid bookings are
 * cancelled and refunded, or their holders told and offered an exchange, as decided.
 */
export async function performanceCancelled(unit: UnitView, performanceId: string): Promise<void> {
  const decision = await useDecision(unit, performanceId)
  unit.add(sql`UPDATE box_office_performance_sales SET state = 'closed', updated_at = ${nowMs()} WHERE performance_id = ${performanceId} AND state IN ('on_sale', 'paused')`)
  const offer = decision === 'offer_exchange'
  for (const order of await bookingsFor(performanceId)) {
    if (order.state === 'confirmed' && offer) await tell(unit, order, performanceId, 'has been cancelled', OFFER_CANCELLED)
    else unit.enqueue('box-office.cancel-order', { orderId: order.id, performanceId, what: 'has been cancelled' })
  }
}

/**
 * core.performance.rescheduled and core.performance.moved: tickets stay valid and their holders are
 * told the new time or place, unless everyone was to be refunded.
 */
export async function performanceChanged(unit: UnitView, performanceId: string, what: string): Promise<void> {
  const decision = await useDecision(unit, performanceId)
  for (const order of await bookingsFor(performanceId)) {
    if (decision === 'refund_all') unit.enqueue('box-office.cancel-order', { orderId: order.id, performanceId, what })
    else await tell(unit, order, performanceId, what, decision === 'offer_exchange' ? OFFER_CHANGED : KEEP)
  }
}

const OFFER_CANCELLED = 'Your booking is kept for now. Contact the box office to exchange your tickets for another performance, or to have them refunded.'
const OFFER_CHANGED = 'Your tickets are still valid. If you cannot come now, contact the box office to exchange them for another performance or to have them refunded.'
const KEEP = 'Your tickets are still valid, and there is nothing you need to do.'

async function tell(unit: UnitView, order: OrderRow, performanceId: string, what: string, next: string): Promise<void> {
  if (!order.account_id) return
  const lines = (await liveLines(order.id)).filter(l => l.performance_id === performanceId)
  if (!lines.length) return
  const words = await wordsFor(order, lines, 0)
  const performance = await getPerformance(performanceId)
  await notify(unit, 'box-office.performance-changed', {
    to: order.account_id,
    variables: {
      reference: order.reference,
      show: words.show,
      what,
      now: performance.state === 'cancelled' ? `It was to be on ${words.when}, at ${performance.venueName}, ${performance.spaceName}.` : `It is now on ${words.when}, at ${performance.venueName}, ${performance.spaceName}.`,
      next,
    },
    subject: ['box-office.order', order.id],
    dedupeKey: `performance-changed:${order.id}:${performanceId}:${performance.startsAt}:${performance.spaceId}:${performance.state}`,
  })
}

/** One booking of a decision to refund everyone: its tickets for the performance cancelled and refunded in full. Safe to repeat. */
export async function cancelForPerformance(unit: UnitView, orderId: string, performanceId: string, what: string): Promise<void> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order || (order.state !== 'reserved' && order.state !== 'confirmed')) return
  const ids = (await all<{ id: string }>(`SELECT l.id FROM box_office_order_lines l WHERE l.order_id = ? AND l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live'
    AND NOT EXISTS (SELECT 1 FROM box_office_tickets t WHERE t.order_line_id = l.id AND t.state = 'valid' AND t.admitted_at IS NOT NULL)`, orderId, performanceId)).map(r => r.id)
  if (!ids.length) return
  await cancelLines(unit, orderId, { lineIds: ids, refund: 'full', by: null, kind: 'performance', what })
}
