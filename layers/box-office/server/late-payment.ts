// A booking that lapsed unpaid but was paid for outside the site (Box office specification, part 4,
// "A payment taken outside the site"): once its performance is past selling, the money is recorded as
// an Other payment and kept as ticket income. The booking stays lapsed; nothing is issued or seated.
import { sql } from 'drizzle-orm'
import { first, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { recordTakenOutside } from '#modules/payments'

const NOT_LAPSED = { code: 'box-office.order.not-lapsed', reason: 'Only a booking that lapsed unpaid can have a payment recorded this way.' }

/** Why a payment taken outside the site cannot be recorded for this order, or null when it can. */
export async function latePaymentBlocked(orderId: string, at = nowMs()): Promise<{ code: string, reason: string, remedy?: string } | null> {
  const order = await first<{ state: string, total_minor: number }>('SELECT state, total_minor FROM box_office_orders WHERE id = ?', orderId)
  if (!order || order.state !== 'expired' || order.total_minor <= 0) return NOT_LAPSED
  const line = await first<{ performance_id: string }>("SELECT performance_id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' ORDER BY id LIMIT 1", orderId)
  if (!line) return NOT_LAPSED
  const paid = await first<{ one: number }>("SELECT 1 AS one FROM payments_intent_parts WHERE owner_module = 'box-office' AND owner_record = ? AND settled_at IS NOT NULL AND refunded_minor < amount_minor LIMIT 1", orderId)
  if (paid) return { code: 'payments.outside.already-paid', reason: 'A payment for this booking is already recorded.' }
  const performance = await getPerformance(line.performance_id)
  if (performance.state === 'cancelled') return { code: 'box-office.order.performance-cancelled', reason: 'The performance was cancelled, so there is nothing to have paid for.' }
  const until = performance.startsAt + (await useSetting('box-office.sales.desk-until-after') as number) * 1000 // not-policy: seconds to milliseconds
  if (performance.state === 'scheduled' && at < until)
    return { code: 'box-office.order.still-on-sale', reason: 'This performance is still on sale.', remedy: 'Seat them again from the booking and take the payment on the till.' }
  return null
}

export async function recordLatePayment(unit: UnitView, orderId: string, input: { providerAccountId: string, note: string }, by: string): Promise<{ intentId: string }> {
  const blocked = await latePaymentBlocked(orderId)
  if (blocked) refuse(blocked.code, blocked.reason, { status: 409, ...(blocked.remedy ? { remedy: blocked.remedy } : {}) })
  const order = (await first<{ total_minor: number }>('SELECT total_minor FROM box_office_orders WHERE id = ?', orderId))!
  unit.add(sql`UPDATE box_office_orders SET updated_at = ${nowMs()} WHERE id = ${orderId} AND state = 'expired' AND total_minor = ${order.total_minor}`).expect(1, NOT_LAPSED)
  const { intentId } = await recordTakenOutside(unit, { owner: { module: 'box-office', record: orderId }, amountMinor: order.total_minor, providerAccountId: input.providerAccountId, note: input.note, by })
  return { intentId }
}
