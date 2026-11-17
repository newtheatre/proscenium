// Cancelling tickets (BO-50; Box office specification, part 3, "Cancelling and exchanging"). One
// batch cancels the lines, puts their seats back on sale, voids their tickets, lowers the order's
// total, writes the cancellation row and asks Payments for any refund, so a failure leaves all as
// it was. Refunding is Payments' work from there: who approves it, sending it back the way it was
// paid, and the limit that it can never exceed what was paid. A ticket already used at the door is
// not cancelled.
import { sql } from 'drizzle-orm'
import { all, first, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { assertTerm, getPerformance, getTerm, notify } from '#modules/core'
import { balances, postEntries } from '#modules/finance'
import type { OwnerEntry } from '#modules/payments'
import { cancellations } from './db/schema'
import { liveLines, ORDER, wordsFor, type OrderRow } from './orders'
import { refundOrder } from './refunds'

const DEFERRED = { key: 'box-office.deferred-ticket-income' }
const INCOME = { key: 'box-office.ticket-income' }
const FEES = { key: 'box-office.booking-fee-income' }
const REASONS = 'box-office.cancellation-reason'

export interface CancelInput {
  /** The lines to cancel; all that are live when left out. */
  lineIds?: string[]
  /** The whole price back, the price less the cancellation fee for each ticket, or nothing. */
  refund: 'full' | 'less-fee' | 'none'
  /** From the theatre's list. Required when the order is paid for. */
  reasonTermId?: string | null
  note?: string | null
  /** Null when the system cancels, for a performance that has been cancelled or changed. */
  by: string | null
  /**
   * `staff` by default. `performance` is the box office manager's decision being carried out for a
   * performance that was cancelled, rescheduled or moved (BO-52, BO-53): no reason is asked for,
   * the refund needs no second approver, and the message says why. `customer` is the buyer cancelling
   * from the link in their messages, as the theatre's settings allow: no reason, and a refund less
   * the fee that is asked for by the system, so no second person approves it.
   */
  kind?: 'staff' | 'performance' | 'customer'
  /** For `performance`: what happened to it, as the message says it, such as "has been cancelled". */
  what?: string
}

export interface Cancelled {
  orderId: string
  cancellationId: string
  state: 'reserved' | 'confirmed' | 'cancelled'
  totalMinor: number
  feeMinor: number
  /** Null when nothing was refunded. A refund above what one person may approve alone waits as `requested`. */
  refund: { id: string, state: 'requested' | 'approved', amountMinor: number } | null
}

/**
 * Shares an amount of money over the performances of some lines, in order, each line taking up to
 * its own price. Anything left over (there should be nothing) goes to the last performance.
 */
export function spread(lines: { performance_id: string, amount_minor: number }[], amountMinor: number): Map<string, number> {
  const out = new Map<string, number>()
  let left = amountMinor
  for (const line of lines) {
    const take = Math.min(left, line.amount_minor)
    if (take > 0) out.set(line.performance_id, (out.get(line.performance_id) ?? 0) + take)
    left -= take
  }
  const last = lines.at(-1)
  if (left > 0 && last) out.set(last.performance_id, (out.get(last.performance_id) ?? 0) + left)
  return out
}

/** Ledger entries on one account, performance by performance, each tagged with its production. */
export async function tagged(account: { key: string }, totals: Map<string, number>, sign: 1 | -1): Promise<OwnerEntry[]> {
  return Promise.all([...totals].filter(([, amount]) => amount !== 0).map(async ([performanceId, amount]) => ({
    account,
    amountMinor: sign * amount,
    performanceId,
    productionId: (await getPerformance(performanceId)).productionId,
  })))
}

/**
 * Debits for ticket money that is no longer the audience's, performance by performance: off deferred
 * income while the performance still has that much deferred, and off ticket income for whatever the
 * daily task has already recognised, so deferred income never goes below nothing for a performance.
 */
export async function takenBack(totals: Map<string, number>): Promise<OwnerEntry[]> {
  const deferred = new Map<string, number>()
  const recognised = new Map<string, number>()
  for (const [performanceId, amount] of totals) {
    // A liability's balance is a credit, so what is still deferred shows as a negative number.
    const owed = Math.max(0, -(await balances({ systemKeys: [DEFERRED.key], performanceId })).reduce((sum, b) => sum + b.balanceMinor, 0))
    deferred.set(performanceId, Math.min(amount, owed))
    recognised.set(performanceId, amount - Math.min(amount, owed))
  }
  return [...await tagged(DEFERRED, deferred, 1), ...await tagged(INCOME, recognised, 1)]
}

/** What a refund of an order's part takes back off deferred income, by performance. */
export async function refundEntries(orderId: string, refund: { id: string, amountMinor: number }): Promise<OwnerEntry[]> {
  const cancellation = await first<{ line_ids: string }>('SELECT line_ids FROM box_office_cancellations WHERE refund_id = ?', refund.id)
  // A refund asked for with a cancellation is for that cancellation's lines. One asked for on its
  // own, from Payments' screens, is set against the order's cancelled lines first.
  const lines = await all<{ id: string, performance_id: string, amount_minor: number }>(
    'SELECT id, performance_id, amount_minor FROM box_office_order_lines WHERE order_id = ? AND kind = \'ticket\' ORDER BY (state = \'live\'), id', orderId)
  const ids = cancellation ? new Set(JSON.parse(cancellation.line_ids) as string[]) : null
  const totals = spread(ids ? lines.filter(l => ids.has(l.id)) : lines, refund.amountMinor)
  if (!totals.size) return [{ account: DEFERRED, amountMinor: refund.amountMinor, performanceId: null }]
  return takenBack(totals)
}

/** Cancels lines of a reserved or confirmed order for a member of staff, with any refund. */
export async function cancelLines(unit: UnitView, orderId: string, input: CancelInput): Promise<Cancelled> {
  const order = await first<OrderRow>(`${ORDER} WHERE id = ?`, orderId)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  if (order.state !== 'reserved' && order.state !== 'confirmed')
    refuse('box-office.order.not-cancellable', 'Only a reservation or a confirmed booking can be cancelled.', { status: 409 })
  const paid = order.state === 'confirmed'
  // A reason is needed to cancel what was paid for. A reservation may go without one: nothing was paid, and the queue is waiting.
  const byPerformance = input.kind === 'performance'
  const byBuyer = input.kind === 'customer'
  if (paid && !input.reasonTermId && !byPerformance && !byBuyer) refuse('box-office.order.bad-reason', 'Choose a reason for cancelling paid tickets.', { status: 422, fields: { reasonTermId: 'required' } })
  const term = input.reasonTermId ? await getTerm(input.reasonTermId) : null
  if (input.reasonTermId && (!term || term.vocabularyKey !== REASONS || term.retired))
    refuse('box-office.order.bad-reason', 'That reason is not on the list of reasons for cancelling.', { status: 422, remedy: 'Choose a reason from the list.' })

  const lines = await liveLines(order.id)
  const chosen = input.lineIds ? lines.filter(l => input.lineIds!.includes(l.id)) : lines
  const changed = { code: 'box-office.order.lines-changed', reason: 'This booking has just changed.', remedy: 'Reload to see what is booked.' }
  if (!chosen.length || (input.lineIds && chosen.length !== new Set(input.lineIds).size)) refuse(changed.code, 'Those tickets are not on this booking any more.', { status: 409, remedy: changed.remedy })
  const kept = lines.filter(l => !chosen.includes(l))
  // A companion comes with somebody: theirs cannot be the only tickets left for a performance.
  for (const performanceId of new Set(kept.map(l => l.performance_id))) {
    if (kept.filter(l => l.performance_id === performanceId).every(l => l.type_kind === 'companion'))
      refuse('box-office.order.companion-alone', 'A companion ticket cannot stay on a booking without the ticket it accompanies.', { status: 422, remedy: 'Cancel the companion ticket as well.' })
  }
  const ids = JSON.stringify(chosen.map(l => l.id))
  const used = { code: 'box-office.order.already-admitted', reason: 'A ticket that has been used at the door cannot be cancelled.', remedy: 'Leave out the tickets that have been scanned in.' }
  if (paid && await first('SELECT 1 AS one FROM box_office_tickets WHERE state = \'valid\' AND admitted_at IS NOT NULL AND order_line_id IN (SELECT value FROM json_each(?))', ids))
    refuse(used.code, used.reason, { status: 409, remedy: used.remedy })

  // What goes back, and what is kept of it.
  const chosenMinor = chosen.reduce((sum, l) => sum + l.amount_minor, 0)
  const fee = input.refund === 'less-fee' ? await useSetting('box-office.cancellations.fee') as number : 0
  const feeMinor = paid && input.refund !== 'none' ? chosen.reduce((sum, l) => sum + Math.min(fee, l.amount_minor), 0) : 0
  const refundMinor = paid && input.refund !== 'none' ? chosenMinor - feeMinor : 0
  const totalMinor = order.total_minor - chosenMinor
  const at = nowMs()

  let refund: Cancelled['refund'] = null
  if (refundMinor > 0) {
    refund = await refundOrder(unit, order, refundMinor, input.by, 'Cancel with no refund.')
  }

  unit.add(sql`UPDATE box_office_order_lines SET state = 'cancelled', updated_at = ${at}
    WHERE order_id = ${order.id} AND state = 'live' AND id IN (SELECT value FROM json_each(${ids}))`).expect(chosen.length, changed)
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'cancelled'
    WHERE state = 'confirmed' AND id IN (SELECT claim_id FROM box_office_order_lines WHERE order_id = ${order.id} AND id IN (SELECT value FROM json_each(${ids})))`).expect(chosen.length, changed)
  if (paid) {
    unit.add(sql`UPDATE box_office_tickets SET state = 'void', void_reason = ${byPerformance ? 'performance_cancelled' : 'cancelled'}, updated_at = ${at}
      WHERE state = 'valid' AND admitted_at IS NULL AND order_line_id IN (SELECT value FROM json_each(${ids}))`).expect(chosen.length, used)
  }
  const still = sql`id = ${order.id} AND state = ${order.state} AND total_minor = ${order.total_minor} AND ${input.reasonTermId ? assertTerm(input.reasonTermId, REASONS) : sql`1 = 1`}`
  unit.add(kept.length
    ? sql`UPDATE box_office_orders SET total_minor = ${totalMinor}, updated_at = ${at} WHERE ${still}`
    : sql`UPDATE box_office_orders SET state = 'cancelled', total_minor = ${totalMinor}, cancelled_at = ${at}, release_at = NULL, updated_at = ${at} WHERE ${still}`)
    .expect(1, changed)
  const [cancellationId] = unit.insertSet(cancellations, [{ orderId: order.id, kind: byPerformance ? 'performance_cancelled' : byBuyer ? 'customer' : 'staff', reasonTermId: input.reasonTermId ?? null, note: input.note ?? null, lineIds: ids, refundId: refund?.id ?? null, feeMinor, by: input.by }])

  // The fee kept stops being owed to the audience now. It is whatever of each performance's lines
  // the refund does not take back, so the two together always empty what the lines had deferred.
  if (feeMinor > 0) {
    const back = spread(chosen, refundMinor)
    const keptBack = new Map<string, number>()
    for (const line of chosen) keptBack.set(line.performance_id, (keptBack.get(line.performance_id) ?? 0) + line.amount_minor)
    for (const [performanceId, amount] of back) keptBack.set(performanceId, keptBack.get(performanceId)! - amount)
    await postEntries(unit, {
      key: `box-office:cancellation:${cancellationId}:fee`,
      source: { module: 'box-office', type: 'order', id: order.id },
      kind: 'transfer',
      currency: order.currency,
      postedBy: input.by,
      entries: [...await takenBack(keptBack), ...await tagged(FEES, keptBack, -1)],
    })
  }

  unit.announce('box-office.order.cancelled', { orderId: order.id, cancellationId: cancellationId! }, { record: ['box-office.order', order.id] })
  if (order.account_id) {
    const words = await wordsFor(order, lines, totalMinor)
    const left = kept.length ? await wordsFor(order, kept, totalMinor) : null
    const money = refund ? ` A refund of ${(await wordsFor(order, lines, refundMinor)).amount} will go back the way you paid.` : ''
    if (byPerformance) {
      await notify(unit, 'box-office.performance-cancelled', {
        to: order.account_id,
        variables: {
          reference: order.reference,
          show: words.show,
          when: words.when,
          what: input.what ?? 'has been cancelled',
          money: (paid ? 'Your tickets have been cancelled.' : 'Your reservation has been cancelled, and there is nothing to pay.') + money,
        },
        subject: ['box-office.order', order.id],
        dedupeKey: `performance-cancelled:${order.id}:${chosen[0]!.performance_id}`,
      })
      return { orderId: order.id, cancellationId: cancellationId!, state: kept.length ? order.state : 'cancelled', totalMinor, feeMinor, refund }
    }
    await notify(unit, 'box-office.order-cancelled', {
      to: order.account_id,
      variables: {
        reference: order.reference,
        show: words.show,
        when: words.when,
        cancelled: chosen.length === 1 ? '1 ticket' : `${chosen.length} tickets`,
        remaining: (left
          ? paid ? `Still booked: ${left.tickets}.` : `Still reserved: ${left.tickets}. To pay on arrival: ${left.amount}.`
          : paid ? 'Nothing is booked on this reference now.' : 'Nothing is reserved on this booking now, and there is nothing to pay.') + money,
      },
      subject: ['box-office.order', order.id],
    })
  }
  return { orderId: order.id, cancellationId: cancellationId!, state: kept.length ? order.state : 'cancelled', totalMinor, feeMinor, refund }
}
