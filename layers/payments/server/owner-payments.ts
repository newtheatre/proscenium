// What was paid towards, and refunded from, records another module owns, for that record's own page
// (an order's Payments section): each payment's share for the records, how it was paid and who took
// it, and every refund asked for, with its state and whether a person hands the money back.
import { all } from '#kit'
import { labelsOf } from './people'
import { describeRefunds, type RefundSummary } from './refunds'

export interface OwnerPayment {
  intentId: string
  /** The records' share of the payment; a combined sale may have paid for other things too. */
  amountMinor: number
  refundedMinor: number
  currency: string
  channel: 'online' | 'desk'
  /** How it was paid, from the attempts that succeeded: `cash`, `card_reader` and so on. */
  methods: string[]
  /** Who recorded it at the till: the person who answered the attempt, or else who opened the till session. Null online. */
  takenBy: string | null
  takenByName: string | null
  /** The till it was taken at, if any. */
  point: string | null
  at: number
}

/** The settled payments and every refund for these records of one module, oldest payment first. */
export async function paymentsOf(module: string, records: string[]): Promise<{ payments: OwnerPayment[], refunds: RefundSummary[] }> {
  if (!records.length) return { payments: [], refunds: [] }
  const parts = await all<{ id: string, intent_id: string, amount_minor: number, refunded_minor: number, settled_at: number | null, currency: string, channel: 'online' | 'desk', created_at: number, point: string | null, opened_by: string | null }>(
    `SELECT p.id, p.intent_id, p.amount_minor, p.refunded_minor, p.settled_at, i.currency, i.channel, i.created_at, s.point_label AS point, s.opened_by
      FROM payments_intent_parts p JOIN payments_intents i ON i.id = p.intent_id LEFT JOIN payments_sessions s ON s.id = i.session_id
      WHERE p.owner_module = ? AND p.owner_record IN (SELECT value FROM json_each(?)) ORDER BY i.created_at, p.id`, module, JSON.stringify(records))
  if (!parts.length) return { payments: [], refunds: [] }
  const intentIds = JSON.stringify([...new Set(parts.map(p => p.intent_id))])
  const attempts = await all<{ intent_id: string, method: string, answered_by: string | null, answered_at: number | null }>(
    'SELECT intent_id, method, answered_by, answered_at FROM payments_attempts WHERE state = \'succeeded\' AND intent_id IN (SELECT value FROM json_each(?)) ORDER BY started_at', intentIds)
  const refundIds = await all<{ id: string }>(
    'SELECT id FROM payments_refunds WHERE part_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, id', JSON.stringify(parts.map(p => p.id)))

  const byIntent = new Map<string, OwnerPayment>()
  for (const part of parts.filter(p => p.settled_at !== null)) {
    const paid = attempts.filter(a => a.intent_id === part.intent_id)
    const known = byIntent.get(part.intent_id)
    if (known) {
      known.amountMinor += part.amount_minor
      known.refundedMinor += part.refunded_minor
      continue
    }
    const takenBy = paid.find(a => a.answered_by)?.answered_by ?? part.opened_by ?? null
    byIntent.set(part.intent_id, {
      intentId: part.intent_id,
      amountMinor: part.amount_minor,
      refundedMinor: part.refunded_minor,
      currency: part.currency,
      channel: part.channel,
      methods: [...new Set(paid.map(a => a.method))],
      takenBy,
      takenByName: null,
      point: part.point,
      at: paid.reduce((latest, a) => Math.max(latest, a.answered_at ?? 0), 0) || part.settled_at!,
    })
  }
  const payments = [...byIntent.values()]
  const names = await labelsOf(payments.map(p => p.takenBy))
  for (const p of payments) p.takenByName = p.takenBy ? names.get(p.takenBy) ?? null : null
  return { payments, refunds: await describeRefunds(refundIds.map(r => r.id)) }
}
