// What Needs attention lists (Box office specification, part 5): attempts with no answer, with how
// long each has waited and whether the till had already given up on the payment, payments taken that
// could not be completed and are not yet refunded (with what they were for, and whether they may be kept), refunds
// the provider turned down, and till sessions that stopped with cash in them and await their count.
import { z } from 'zod'
import { all, can, defineRoute, nowMs } from '#kit'
import { describeSessions } from '../../sessions'
import { describeOwners, type DescribedOwner } from '../../owners'
import { BEING_RETURNED } from '../../keep'

export default defineRoute({
  ability: 'payments.attempt.reconcile',
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { actor }) => {
  const now = nowMs()
  const unknown = await all<{ id: string, intent_id: string, method: string, amount_minor: number, currency: string, provider_ref: string | null, label: string, started_at: number, intent_state: string }>(
    `SELECT a.id, a.intent_id, a.method, a.amount_minor, i.currency, a.provider_ref, p.label, a.started_at, i.state AS intent_state FROM payments_attempts a
      JOIN payments_intents i ON i.id = a.intent_id JOIN payments_provider_accounts p ON p.id = a.provider_account_id
      WHERE a.state = 'unknown' ORDER BY a.started_at`)
  const unfulfilled = await all<{ id: string, amount_minor: number, currency: string, updated_at: number }>(
    `SELECT i.id, i.amount_minor, i.currency, i.updated_at FROM payments_intents i WHERE ${BEING_RETURNED} ORDER BY i.updated_at`)
  const mayKeep = (await can(actor, 'payments.refund.approve')).allowed
  // A refund the system asked for and nobody has sent or handed back yet: the one to keep the payment from.
  const keepable = new Map((await all<{ intent_id: string, id: string }>(
    `SELECT p.intent_id, min(r.id) AS id FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id
      WHERE r.state = 'approved' AND r.requested_by IS NULL AND p.intent_id IN (SELECT value FROM json_each(?))
        AND NOT EXISTS (SELECT 1 FROM payments_refunds o JOIN payments_intent_parts q ON q.id = o.part_id WHERE q.intent_id = p.intent_id AND (o.state IN ('sent', 'succeeded') OR o.requested_by IS NOT NULL))
      GROUP BY p.intent_id`, JSON.stringify(unfulfilled.map(i => i.id)))).map(r => [r.intent_id, r.id]))
  const parts = await all<{ intent_id: string, owner_module: string, owner_record: string }>(
    'SELECT intent_id, owner_module, owner_record FROM payments_intent_parts WHERE intent_id IN (SELECT value FROM json_each(?)) ORDER BY id',
    JSON.stringify([...new Set([...unknown.map(a => a.intent_id), ...unfulfilled.map(i => i.id)])]))
  const owners = await describeOwners(parts.map(p => ({ module: p.owner_module, record: p.owner_record })))
  const forIntent = (id: string): DescribedOwner[] => parts.filter(p => p.intent_id === id).map(p => owners.get(`${p.owner_module}:${p.owner_record}`)!)
  const failed = await all<{ id: string, amount_minor: number, currency: string, method: string, updated_at: number }>(
    `SELECT r.id, r.amount_minor, i.currency, a.method, r.updated_at FROM payments_refunds r JOIN payments_attempts a ON a.id = r.attempt_id
      JOIN payments_intents i ON i.id = a.intent_id WHERE r.state = 'failed' ORDER BY r.updated_at`)
  // Refunds waiting for a second person, shown only to someone who may approve them.
  const waiting = (await can(actor, 'payments.refund.approve')).allowed
    ? await all<{ id: string, amount_minor: number, currency: string, method: string, created_at: number }>(
        `SELECT r.id, r.amount_minor, i.currency, a.method, r.created_at FROM payments_refunds r JOIN payments_attempts a ON a.id = r.attempt_id
          JOIN payments_intents i ON i.id = a.intent_id WHERE r.state = 'requested' ORDER BY r.created_at`)
    : []
  const counting = await all<{ id: string }>("SELECT id FROM payments_sessions WHERE state = 'counting' ORDER BY opened_at")
  const awaiting = await describeSessions(counting.map(s => s.id))
  return {
    awaitingCount: awaiting.map(s => ({ id: s.id, place: s.place, pointLabel: s.pointLabel, openedByName: s.openedByName, openedAt: s.openedAt, expectedCashMinor: s.expectedCashMinor, currency: s.currency })),
    unknown: unknown.map(a => ({ id: a.id, intentId: a.intent_id, method: a.method, amountMinor: a.amount_minor, currency: a.currency, providerRef: a.provider_ref, provider: a.label, waitingMs: now - a.started_at, abandoned: a.intent_state === 'cancelled' || a.intent_state === 'expired', owners: forIntent(a.intent_id), mayKeep })),
    unfulfilled: unfulfilled.map(i => ({ id: i.id, amountMinor: i.amount_minor, currency: i.currency, sinceMs: now - i.updated_at, owners: forIntent(i.id), keepRefundId: mayKeep ? keepable.get(i.id) ?? null : null })),
    waitingRefunds: waiting.map(r => ({ id: r.id, amountMinor: r.amount_minor, currency: r.currency, method: r.method, sinceMs: now - r.created_at })),
    failedRefunds: failed.map(r => ({ id: r.id, amountMinor: r.amount_minor, currency: r.currency, method: r.method, sinceMs: now - r.updated_at })),
  }
})
