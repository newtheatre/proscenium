// One order for staff (Box office specification, part 6, "Order"): its tickets with whether each was
// admitted, its cancellations, and which of release, keep, cancel and refund the viewer may do.
import { getRouterParam } from 'h3'
import { all, can, defineRoute, first, refuse, useSetting } from '#kit'
import { accountLabel, addressFor, getPerformance, getProduction, getTerm } from '#modules/core'
import { paymentsOf } from '#modules/payments'

interface Order { id: string, reference: string, state: string, channel: string, account_id: string | null, sold_by: string | null, currency: string, total_minor: number, keep: number, release_at: number | null, reserved_at: number | null, confirmed_at: number | null, cancelled_at: number | null, created_at: number }
interface Line { id: string, kind: string, performance_id: string | null, band_id: string | null, ticket_type_id: string | null, band: string | null, ticket_type: string | null, amount_minor: number, state: string, admitted_at: number | null, ticket_state: string | null, requirement_evidence_id: string | null, pass_entry: number }
interface Cancellation { id: string, kind: string, reason_term_id: string | null, note: string | null, line_ids: string, refund_id: string | null, fee_minor: number, by: string | null, created_at: number }

export default defineRoute({
  ability: 'box-office.order.view',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const id = record!.id!
  const order = await first<Order>(`SELECT id, reference, state, channel, account_id, sold_by, currency, total_minor, keep, release_at, reserved_at, confirmed_at, cancelled_at, created_at
    FROM box_office_orders WHERE id = ? AND state <> 'basket'`, id)
  if (!order) refuse('box-office.order.not-found', 'There is no such order.', { status: 404 })
  const lines = await all<Line>(`SELECT l.id, l.kind, l.performance_id, l.band_id, l.ticket_type_id, b.name AS band, t.name AS ticket_type, l.amount_minor, l.state, k.admitted_at, k.state AS ticket_state, l.requirement_evidence_id, (l.pass_redemption_id IS NOT NULL) AS pass_entry
    FROM box_office_order_lines l
    LEFT JOIN box_office_bands b ON b.id = l.band_id
    LEFT JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
    LEFT JOIN box_office_tickets k ON k.order_line_id = l.id
    WHERE l.order_id = ? ORDER BY l.id`, id)
  const cancellations = await all<Cancellation>('SELECT id, kind, reason_term_id, note, line_ids, refund_id, fee_minor, by, created_at FROM box_office_cancellations WHERE order_id = ? ORDER BY created_at', id)
  const performanceId = lines.find(l => l.performance_id)?.performance_id
  const performance = performanceId ? await getPerformance(performanceId) : null
  // What was paid and refunded, from Payments: the order's own payment and any taken for an exchange.
  const exchanges = await all<{ id: string }>('SELECT id FROM box_office_exchanges WHERE order_id = ?', id)
  const money = await paymentsOf('box-office', [id, ...exchanges.map(e => e.id)])
  const ref = ['box-office.order', id] as const
  const allowed = async (ability: Parameters<typeof can>[1]) => (await can(actor, ability, ref)).allowed

  return {
    id: order.id,
    reference: order.reference,
    state: order.state,
    channel: order.channel,
    currency: order.currency,
    totalMinor: order.total_minor,
    keep: !!order.keep,
    releaseAt: order.release_at,
    createdAt: order.created_at,
    confirmedAt: order.confirmed_at,
    cancelledAt: order.cancelled_at,
    buyer: order.account_id ? { id: order.account_id, name: await accountLabel(order.account_id), email: await addressFor(order.account_id, 'audience') } : null,
    soldBy: order.sold_by ? await accountLabel(order.sold_by) : null,
    payments: money.payments.map(p => ({ intentId: p.intentId, amountMinor: p.amountMinor, refundedMinor: p.refundedMinor, methods: p.methods, takenBy: p.takenByName, point: p.point, at: p.at })),
    refunds: money.refunds.map(r => ({ id: r.id, amountMinor: r.amountMinor, method: r.method, state: r.state, handBack: r.handBack, requestedBy: r.requestedByName, approvedBy: r.approvedByName, at: r.createdAt })),
    performance: performance ? { id: performance.id, title: (await getProduction(performance.productionId)).title, startsAt: performance.startsAt } : null,
    complimentary: (await first<{ one: number }>('SELECT 1 AS one FROM box_office_order_lines WHERE order_id = ? AND comp_request_id IS NOT NULL LIMIT 1', id)) !== null,
    lines: lines.map(l => ({ id: l.id, kind: l.kind, bandId: l.band_id, band: l.band, ticketTypeId: l.ticket_type_id, ticketType: l.ticket_type, amountMinor: l.amount_minor, state: l.state, admittedAt: l.admitted_at, ticketState: l.ticket_state, requirementPending: l.requirement_evidence_id === 'pending', passEntry: !!l.pass_entry })),
    // The fee kept on each ticket when a cancellation is refunded less the fee, so the dialogue can show the refund.
    cancellationFeeMinor: await useSetting('box-office.cancellations.fee') as number,
    cancellations: await Promise.all(cancellations.map(async c => ({
      id: c.id, kind: c.kind, note: c.note, lineCount: (JSON.parse(c.line_ids) as string[]).length, refunded: !!c.refund_id, feeMinor: c.fee_minor,
      reason: c.reason_term_id ? (await getTerm(c.reason_term_id))?.label ?? null : null,
      by: c.by ? await accountLabel(c.by) : null, at: c.created_at,
    }))),
    can: {
      release: order.state === 'reserved' && await allowed('box-office.order.release'),
      collect: order.state === 'reserved' && await allowed('box-office.order.take-payment'),
      cancel: (order.state === 'reserved' || order.state === 'confirmed') && await allowed('box-office.order.cancel'),
      refund: order.state === 'confirmed' && await allowed('box-office.order.refund'),
      exchange: (order.state === 'reserved' || order.state === 'confirmed') && await allowed('box-office.order.exchange'),
    },
  }
})
