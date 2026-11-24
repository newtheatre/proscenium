// Refunds (Box office specification, part 3, "A refund"). A refund names one part and the attempt
// that took the money, so it goes back the way it came and never takes a part or an attempt past
// what was paid: the counters on both, kept by trigger, add on approval and subtract only on failure
// or when the payment is kept, and their CHECKs refuse the rest. The limit one person may approve alone is copied onto the refund
// when it is requested, so a later change to the setting cannot loosen it.
import { sql } from 'drizzle-orm'
import { all, createUnit, first, newId, nowMs, Refusal, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { assertTerm } from '#modules/core'
import { postEntries, type EntryInput } from '#modules/finance'
import { asPart, getIntent, settlements, type IntentRow, type PartRow } from './intents'
import { clearingFor, forProvider, providerAccount, providers } from './providers'
import { describeOwners, type DescribedOwner } from './owners'
import { labelsOf } from './people'
import { isTestMoney } from './test-money'
import type { AttemptRow } from './answers'
import type { RefundAnswer } from './points/provider'
import { ownerEntries } from './owner-entries'

const SECOND = 1000 // not-policy: milliseconds in a second

export type RefundState = 'requested' | 'approved' | 'sent' | 'succeeded' | 'failed' | 'declined'
export interface RefundRow { id: string, attempt_id: string, part_id: string, amount_minor: number, state: RefundState, idempotency_key: string, provider_ref: string | null, requested_by: string | null, self_approve_limit_minor: number, approved_by: string | null, decline_reason_term_id: string | null, session_id: string | null, created_at: number }

export async function getRefund(id: string): Promise<RefundRow | null> {
  return first<RefundRow>('SELECT * FROM payments_refunds WHERE id = ?', id)
}

async function partOf(id: string): Promise<PartRow | null> {
  return first<PartRow>('SELECT * FROM payments_intent_parts WHERE id = ?', id)
}

function ownerOf(part: PartRow) {
  return { moduleId: part.owner_module, recordId: part.owner_record }
}

/** Whether the attempt's provider sends refunds itself, or a person hands the money back. */
async function integrated(attempt: AttemptRow): Promise<boolean> {
  const account = await providerAccount(attempt.provider_account_id)
  return !!account && !!(await providers()).get(account.provider)?.refund
}

export interface RefundRequest {
  partId: string
  amountMinor: number
  /** Which payment to refund. Defaults to the first that took enough for this part. */
  attemptId?: string
  /** The person asking; null for a refund the system asks for. */
  requestedBy: string | null
  /**
   * When this refund is one of several for one decision (an order paid in more than one payment),
   * the whole amount, which is what the self-approve limit is judged against.
   */
  wholeMinor?: number
}

/**
 * Asks for a refund of one part in the caller's unit. Approved in one step when the amount is at
 * or under the self-approve limit, or when the system asks; requested otherwise.
 */
export async function requestRefund(unit: UnitView, input: RefundRequest): Promise<{ refundId: string, state: 'requested' | 'approved' }> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Refusal('payments.refund.bad-amount', 'A refund is a whole amount above zero.', { status: 422, fields: { amountMinor: 'payments.refund.bad-amount' } })
  const part = await partOf(input.partId)
  if (!part) throw new Refusal('core.not-found', 'There is no such part of a payment.', { status: 404 })
  const intent = (await getIntent(part.intent_id))!
  if (part.settled_at === null && intent.state !== 'unfulfilled') throw new Refusal('payments.refund.not-paid', 'Nothing has been paid for this yet.', { status: 409 })
  if (input.amountMinor > part.amount_minor - part.refunded_minor) throw new Refusal('payments.refund.too-much', `At most ${part.amount_minor - part.refunded_minor} of this part can be refunded.`, { status: 422, fields: { amountMinor: 'payments.refund.too-much' } })
  const attempts = await all<AttemptRow & { refunded_minor: number, answered_at: number | null }>("SELECT * FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded' ORDER BY started_at", intent.id)
  const attempt = input.attemptId ? attempts.find(a => a.id === input.attemptId) : attempts.find(a => a.amount_minor - a.refunded_minor >= input.amountMinor)
  if (!attempt) throw new Refusal('payments.refund.no-payment', 'No payment for this has enough left to refund that amount.', { status: 422 })
  if (input.requestedBy) {
    const window = await useSetting('payments.refunds.window') as number
    if ((attempt.answered_at ?? 0) + window * SECOND < nowMs()) throw new Refusal('payments.refund.too-late', 'This payment is too old to refund here.', { status: 409, remedy: 'Settle it with the payer another way.' })
  }
  const limit = await useSetting('payments.refunds.self-approve-up-to') as number
  const oneStep = input.requestedBy === null || Math.max(input.amountMinor, input.wholeMinor ?? 0) <= limit
  const id = newId('rfd')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO payments_refunds (id, attempt_id, part_id, amount_minor, state, idempotency_key, requested_by, self_approve_limit_minor, approved_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, attempt.id, part.id, input.amountMinor, oneStep ? 'approved' : 'requested', `payments:refund:${id}`, input.requestedBy, limit, oneStep ? input.requestedBy : null, at, at],
  })
  unit.announce('payments.refund.requested', { refundId: id, partId: part.id, owner: ownerOf(part) }, { record: ['payments.refund', id] })
  if (oneStep && await integrated(attempt)) unit.enqueue('payments.send-refund', { refundId: id })
  return { refundId: id, state: oneStep ? 'approved' : 'requested' }
}

/** Approves a requested refund. Your own above the stored limit is refused, judged on resolved accounts. */
export async function approveRefund(unit: UnitView, refundId: string, approver: string): Promise<void> {
  const refund = await getRefund(refundId)
  if (!refund) throw new Refusal('core.not-found', 'There is no such refund.', { status: 404 })
  if (refund.state !== 'requested') throw new Refusal('payments.refund.not-requested', 'This refund is not waiting for approval.', { status: 409 })
  if (refund.requested_by && refund.amount_minor > refund.self_approve_limit_minor) {
    if (await first(`SELECT 1 FROM payments_refunds WHERE id = ?1 AND requested_by IN (${accountScopeSql('?2')})`, refund.id, approver))
      throw new Refusal('payments.refund.own', 'You cannot approve a refund you asked for.', { status: 403, remedy: 'Ask someone else who may approve refunds.' })
  }
  unit.add({ sql: "UPDATE payments_refunds SET state = 'approved', approved_by = ?, updated_at = ? WHERE id = ? AND state = 'requested'", params: [approver, nowMs(), refund.id] })
    .expect(1, { code: 'payments.refund.not-requested', reason: 'This refund is no longer waiting for approval.' })
  const attempt = (await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', refund.attempt_id))!
  if (await integrated(attempt)) unit.enqueue('payments.send-refund', { refundId: refund.id })
}

/**
 * Declines a requested refund with a reason from the theatre's list. No counter moves. The owner hears
 * it as payments.refund.failed, so whatever it held against the refund is let go.
 */
export async function declineRefund(unit: UnitView, refundId: string, by: string, reasonTermId: string): Promise<void> {
  const refund = await getRefund(refundId)
  const part = refund ? await partOf(refund.part_id) : null
  unit.add(sql`UPDATE payments_refunds SET state = 'declined', approved_by = ${by}, decline_reason_term_id = ${reasonTermId}, updated_at = ${nowMs()}
    WHERE id = ${refundId} AND state = 'requested' AND ${assertTerm(reasonTermId, 'payments.refund-decline-reason')}`)
    .expect(1, { code: 'payments.refund.cannot-decline', reason: 'This refund is not waiting for approval, or that reason is not on the list.' })
  if (part) unit.announce('payments.refund.failed', { refundId, partId: part.id, owner: ownerOf(part) }, { record: ['payments.refund', refundId] })
}

/** The refund's posting: the money out of its clearing account, and what the owner's sale credited back. */
async function succeed(unit: UnitView, refund: RefundRow, providerRef?: string) {
  const part = (await partOf(refund.part_id))!
  const intent = (await getIntent(part.intent_id))! as IntentRow
  const attempt = (await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', refund.attempt_id))!
  const at = nowMs()
  unit.add({ sql: "UPDATE payments_refunds SET state = 'succeeded', provider_ref = coalesce(provider_ref, ?), updated_at = ? WHERE id = ? AND state IN ('approved', 'sent')", params: [providerRef ?? null, at, refund.id] })
    .expect(1, { code: 'payments.refund.already-answered', reason: 'This refund already has its answer.' })
  unit.announce('payments.refund.succeeded', { refundId: refund.id, partId: part.id, owner: ownerOf(part) }, { record: ['payments.refund', refund.id] })
  // Test money posts nothing, going out as coming in.
  if (await isTestMoney(intent.id, attempt)) return
  let back: EntryInput[]
  if (part.settled_at === null) {
    // An unfulfilled payment: the money was held in payments.unfulfilled, never the owner's.
    back = [{ account: { key: 'payments.unfulfilled' }, amountMinor: refund.amount_minor }]
  }
  else {
    const handler = (await settlements()).get(part.owner_module)
    if (!handler) throw new Refusal('payments.refund.owner-off', 'The module this was sold by is switched off, so its refund cannot be recorded.', { status: 409 })
    const entries = await handler.refunded(unit, asPart(part, intent.currency), { id: refund.id, amountMinor: refund.amount_minor })
    const total = entries.reduce((s, e) => s + e.amountMinor, 0)
    if (total !== refund.amount_minor) throw new Refusal('payments.settlement.part-mismatch', `${part.owner_module}'s entries for this refund total ${total}, not ${refund.amount_minor}.`, { status: 500 })
    back = await ownerEntries(entries, part.owner_module)
  }
  await postEntries(unit, {
    key: `payments:refund:${refund.id}`,
    source: { module: 'payments', type: 'payments.refund', id: refund.id },
    kind: 'refund',
    currency: intent.currency,
    postedBy: null,
    entries: [{ account: clearingFor(attempt.method, attempt.provider_account_id), amountMinor: -refund.amount_minor }, ...back],
  })
}

/** Records a provider's answer to a refund, in its own unit. */
export async function answerRefund(refundId: string, answer: RefundAnswer): Promise<void> {
  const refund = (await getRefund(refundId))!
  if (!['approved', 'sent'].includes(refund.state)) return
  const unit = createUnit()
  const view = unit.view()
  const at = nowMs()
  if (answer.state === 'succeeded') await succeed(view, refund, answer.providerRef)
  else if (answer.state === 'pending') {
    if (refund.state === 'sent') return
    view.add({ sql: "UPDATE payments_refunds SET state = 'sent', provider_ref = coalesce(provider_ref, ?), updated_at = ? WHERE id = ? AND state = 'approved'", params: [answer.providerRef ?? null, at, refund.id] })
  }
  else {
    const part = (await partOf(refund.part_id))!
    view.add({ sql: "UPDATE payments_refunds SET state = 'failed', provider_ref = coalesce(provider_ref, ?), updated_at = ? WHERE id = ? AND state IN ('approved', 'sent')", params: [answer.providerRef ?? null, at, refund.id] })
      .expect(1, { code: 'payments.refund.already-answered', reason: 'This refund already has its answer.' })
    view.announce('payments.refund.failed', { refundId: refund.id, partId: part.id, owner: ownerOf(part) }, { record: ['payments.refund', refund.id] })
  }
  await unit.commit()
}

/** Asks the provider to send an approved refund. Returns the answer it gave. */
export async function sendRefund(refundId: string): Promise<RefundAnswer | null> {
  const refund = await getRefund(refundId)
  if (!refund || !['approved', 'sent'].includes(refund.state)) return null
  const attempt = (await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', refund.attempt_id))!
  const { provider, attempt: asked } = await forProvider(attempt)
  if (!provider?.refund) return null
  // What the provider has already refunded of this payment for other refunds (attempts.refunded_minor
  // also counts approved refunds not yet sent, this one among them).
  const before = await first<{ total: number }>("SELECT coalesce(sum(amount_minor), 0) AS total FROM payments_refunds WHERE attempt_id = ? AND id <> ? AND state = 'succeeded'", attempt.id, refund.id)
  const answer = await provider.refund({ id: refund.id, amountMinor: refund.amount_minor, currency: asked.currency, idempotencyKey: refund.idempotency_key, refundedBeforeMinor: before?.total ?? 0, attempt: asked })
  await answerRefund(refund.id, answer)
  return answer
}

/**
 * A person confirms they handed an approved refund back, for a payment no provider can refund (cash,
 * a standalone card machine). Cash goes back from their open till session.
 */
export async function confirmRefund(unit: UnitView, refundId: string, by: string): Promise<void> {
  const refund = await getRefund(refundId)
  if (!refund) throw new Refusal('core.not-found', 'There is no such refund.', { status: 404 })
  if (refund.state !== 'approved') throw new Refusal('payments.refund.not-approved', 'This refund is not approved to hand back.', { status: 409 })
  const attempt = (await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', refund.attempt_id))!
  if (await integrated(attempt)) throw new Refusal('payments.refund.goes-back-by-provider', 'This payment is refunded through its provider, the way it was paid.', { status: 409 })
  if (attempt.method === 'cash') {
    const session = await first<{ id: string }>(`SELECT id FROM payments_sessions WHERE state = 'open' AND opened_by IN (${accountScopeSql('?1')})`, by)
    if (!session) throw new Refusal('payments.session.none', 'Open a till session to hand back cash.', { status: 409 })
    unit.add({ sql: 'UPDATE payments_refunds SET session_id = ? WHERE id = ?', params: [session.id, refund.id] })
  }
  await succeed(unit, refund)
}

export interface RefundSummary { id: string, partId: string, attemptId: string, /** The order (or other record) refunded, with its reference, buyer and address when its owner gives them. */ owner: DescribedOwner, amountMinor: number, currency: string, method: string, state: RefundState, requestedBy: string | null, requestedByName: string | null, approvedBy: string | null, approvedByName: string | null, selfApproveLimitMinor: number, createdAt: number, /** A person hands the money back and confirms it: cash, or a provider that cannot refund itself. */ handBack: boolean, /** The system's refund, withdrawn because the payment was kept. */ kept: boolean }

/** The refunds with these ids, as Refunds shows them, in the order given. */
export async function describeRefunds(ids: string[]): Promise<RefundSummary[]> {
  if (!ids.length) return []
  const found = await all<RefundRow & { owner_module: string, owner_record: string, currency: string, method: string, provider: string }>(
    `SELECT r.*, p.owner_module, p.owner_record, i.currency, a.method, pa.provider FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id
      JOIN payments_intents i ON i.id = p.intent_id JOIN payments_attempts a ON a.id = r.attempt_id JOIN payments_provider_accounts pa ON pa.id = a.provider_account_id
      WHERE r.id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids))
  const byId = new Map(found.map(r => [r.id, r]))
  const rows = ids.flatMap(id => byId.get(id) ?? [])
  const names = await labelsOf(rows.flatMap(r => [r.requested_by, r.approved_by]))
  const name = (id: string | null) => (id ? names.get(id) ?? null : null)
  const known = await providers()
  const owners = await describeOwners(rows.map(r => ({ module: r.owner_module, record: r.owner_record })))
  return rows.map(r => ({ id: r.id, partId: r.part_id, attemptId: r.attempt_id, owner: owners.get(`${r.owner_module}:${r.owner_record}`)!, amountMinor: r.amount_minor, currency: r.currency, method: r.method, state: r.state, requestedBy: r.requested_by, requestedByName: name(r.requested_by), approvedBy: r.approved_by, approvedByName: name(r.approved_by), selfApproveLimitMinor: r.self_approve_limit_minor, createdAt: r.created_at, handBack: !known.get(r.provider)?.refund, kept: r.state === 'declined' && r.requested_by === null }))
}

/**
 * Asks, in the caller's unit, for the whole of an unfulfilled payment back: each part from the
 * attempts that paid, in order. Requested by the system, so approved at once.
 */
export async function refundInFull(unit: UnitView, intent: IntentRow, parts: PartRow[], attempts: { id: string, amount_minor: number }[]): Promise<string[]> {
  const left = attempts.map(a => ({ id: a.id, left: a.amount_minor }))
  const limit = await useSetting('payments.refunds.self-approve-up-to') as number
  const rows: unknown[][] = []
  const at = nowMs()
  for (const part of parts) {
    let owed = part.amount_minor
    for (const a of left) {
      if (!owed) break
      const take = Math.min(owed, a.left)
      if (!take) continue
      const id = newId('rfd')
      rows.push([id, a.id, part.id, take, `payments:refund:${id}`, limit, at])
      a.left -= take
      owed -= take
    }
  }
  unit.add({
    sql: `INSERT INTO payments_refunds (id, attempt_id, part_id, amount_minor, state, idempotency_key, self_approve_limit_minor, created_at, updated_at)
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), 'approved', json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[6]') FROM json_each(?)`,
    params: [JSON.stringify(rows)],
  }).expect(rows.length)
  return rows.map(r => r[0] as string)
}
