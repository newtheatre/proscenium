// Refunding an order (Box office specification, part 4, "Cancelling and exchanging"). An order is
// usually paid in one payment, but an exchange to dearer tickets takes the difference in a second,
// owned by the exchange. A refund comes out of the latest payment first, and out of more than one
// when no single payment has enough left; the self-approve limit is judged on the whole amount, so
// splitting a refund never lets it through without the approval it would otherwise need.
import { all, refuse, type UnitView } from '#kit'
import { intentStatus, requestRefund } from '#modules/payments'
import type { OrderRow } from './orders'

export interface OrderRefund {
  /** The first refund asked for, which the cancellation records. */
  id: string
  /** Requested when any part needs a second person's approval. */
  state: 'requested' | 'approved'
  amountMinor: number
}

interface Payable { partId: string, leftMinor: number }

/** The settled parts of every payment for an order, latest first, with what each has left to refund. */
export async function orderPayments(order: Pick<OrderRow, 'id' | 'intent_id'>): Promise<Payable[]> {
  const owned: { intentId: string, record: string }[] = (await all<{ id: string, intent_id: string }>(
    'SELECT id, intent_id FROM box_office_exchanges WHERE order_id = ? AND state = \'completed\' AND intent_id IS NOT NULL ORDER BY created_at DESC, id DESC', order.id))
    .map(e => ({ intentId: e.intent_id, record: e.id }))
  if (order.intent_id) owned.push({ intentId: order.intent_id, record: order.id })
  const out: Payable[] = []
  for (const { intentId, record } of owned) {
    const part = (await intentStatus(intentId))?.parts.find(p => p.owner.module === 'box-office' && p.owner.record === record)
    if (part?.settled && part.amountMinor > part.refundedMinor) out.push({ partId: part.id, leftMinor: part.amountMinor - part.refundedMinor })
  }
  return out
}

/** Asks for a refund of an order in the caller's unit, from as many of its payments as it takes. */
export async function refundOrder(unit: UnitView, order: Pick<OrderRow, 'id' | 'intent_id'>, amountMinor: number, by: string, remedy: string): Promise<OrderRefund> {
  const payable = await orderPayments(order)
  if (payable.reduce((sum, p) => sum + p.leftMinor, 0) < amountMinor)
    refuse('box-office.order.nothing-paid', 'Not enough of what was paid for this booking is left to refund that amount.', { status: 409, remedy })
  // One payment that can cover it all is used alone, so most refunds stay one refund.
  const whole = payable.find(p => p.leftMinor >= amountMinor)
  const plan = whole ? [{ partId: whole.partId, amountMinor }] : split(payable, amountMinor)
  const asked = []
  for (const step of plan) asked.push(await requestRefund(unit, { partId: step.partId, amountMinor: step.amountMinor, requestedBy: by, wholeMinor: amountMinor }))
  return { id: asked[0]!.refundId, state: asked.some(a => a.state === 'requested') ? 'requested' : 'approved', amountMinor }
}

function split(payable: Payable[], amountMinor: number): { partId: string, amountMinor: number }[] {
  const plan: { partId: string, amountMinor: number }[] = []
  let left = amountMinor
  for (const p of payable) {
    if (left <= 0) break
    const take = Math.min(left, p.leftMinor)
    plan.push({ partId: p.partId, amountMinor: take })
    left -= take
  }
  return plan
}
