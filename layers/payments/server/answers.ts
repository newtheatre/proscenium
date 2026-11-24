// Answers to attempts, and settling (Box office specification, part 3, "A payment" and "Settling").
// Nothing is written as paid before an answer, and every answer has a source: the provider, a named
// person or the system. When an answer makes the intent whole, every part's owner settles in the same
// batch and Payments writes one sealed posting: the money received, plus each owner's entries. If an
// owner refuses after the money was taken, nothing settles and the intent becomes unfulfilled.
import { all, createUnit, isRefusal, log, newId, nowMs, Refusal, useContext, type UnitView } from '#kit'
import { postEntries, type EntryInput } from '#modules/finance'
import { asPart, getIntent, ownersOf, partsOf, releaseParts, settlements, type IntentRow, type PartRow } from './intents'
import { clearingFor } from './providers'
import { refundInFull } from './refunds'
import { isTestMoney } from './test-money'
import type { Method, ProviderAnswer } from './points/provider'
import { rowsOf, splitsForPart } from './splits'
import { sessionChanged } from './sessions'
import { ownerEntries } from './owner-entries'

export type AttemptState = 'started' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
export interface AttemptRow { id: string, intent_id: string, provider_account_id: string, method: Method, amount_minor: number, state: AttemptState, idempotency_key: string, provider_ref: string | null, reader_id: string | null, started_at: number, refunded_minor: number }

/** Where an answer came from. A person's answer records who; a webhook's, which delivery. */
export type Source = { kind: 'webhook', webhookEventId: string } | { kind: 'poll' } | { kind: 'person', reconciled?: boolean } | { kind: 'system' }

/** An answer: the provider's, a person's, or the system's 'timed out'. */
export type Answer = ProviderAnswer | { state: 'unknown' }

const FROM: Record<Exclude<AttemptState, 'started'>, AttemptState[]> = {
  pending: ['started'],
  succeeded: ['started', 'pending', 'unknown'],
  failed: ['started', 'pending', 'unknown'],
  cancelled: ['started', 'pending'],
  unknown: ['started', 'pending'],
}

function eventKind(answer: Answer, source: Source): string {
  if (answer.state === 'unknown') return 'timed_out'
  if (source.kind === 'person' && source.reconciled) return 'reconciled'
  if (answer.state === 'cancelled') return 'cancelled'
  if (source.kind === 'person') return answer.state === 'succeeded' ? 'attested_succeeded' : 'attested_failed'
  return { pending: 'provider_pending', succeeded: 'provider_succeeded', failed: 'provider_failed' }[answer.state]
}

/** Thrown when an owner refused to settle its part after the money was taken. */
export { isTestMoney, paysForSales, testMoneyTakesSales } from './test-money'

export class SettlementRefused extends Error {
  constructor(readonly module: string, override readonly cause: unknown) {
    super(`${module} could not settle its part: ${String((cause as Error)?.message ?? cause)}`)
  }
}

/** The attempt's move to its answer, and the record of what was heard. */
function recordMove(unit: UnitView, attempt: AttemptRow, answer: Answer, source: Source) {
  const { actor } = useContext()
  const at = nowMs()
  const by = source.kind === 'person' ? actor.accountId ?? null : null
  const from = FROM[answer.state]
  unit.add({
    sql: `UPDATE payments_attempts SET state = ?, provider_ref = coalesce(provider_ref, ?), fee_minor = coalesce(?, fee_minor), failure_code = ?, answered_by = coalesce(?, answered_by), answered_at = ?, updated_at = ?
      WHERE id = ? AND state IN (SELECT value FROM json_each(?))`,
    params: [answer.state, 'providerRef' in answer ? answer.providerRef ?? null : null, answer.state === 'succeeded' ? answer.feeMinor ?? null : null, answer.state === 'failed' ? answer.failureCode : null, by, answer.state === 'pending' ? null : at, at, attempt.id, JSON.stringify(from)],
  }).expect(1, { code: 'payments.attempt.already-answered', reason: 'This payment already has its answer.' })
  unit.add({
    sql: 'INSERT INTO payments_attempt_events (id, attempt_id, kind, source, webhook_event_id, by, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [newId('ate'), attempt.id, eventKind(answer, source), source.kind, source.kind === 'webhook' ? source.webhookEventId : null, by, at],
  })
}

/** A fee the provider reported with its answer: an expense, out of the clearing account. */
async function postFee(unit: UnitView, attempt: AttemptRow, answer: Answer, currency: string): Promise<void> {
  if (answer.state !== 'succeeded' || !answer.feeMinor || await isTestMoney(attempt.intent_id, attempt)) return
  await postEntries(unit, {
    key: `payments:attempt:${attempt.id}:fee`,
    source: { module: 'payments', type: 'payments.attempt', id: attempt.id },
    kind: 'fee',
    currency,
    postedBy: null,
    entries: [{ account: { key: 'payments.provider-fees' }, amountMinor: answer.feeMinor }, { account: clearingFor(attempt.method, attempt.provider_account_id), amountMinor: -answer.feeMinor }],
  })
}

/** The money lines of an intent's posting: each succeeded attempt into its clearing account. */
async function moneyLines(intentId: string, including?: AttemptRow): Promise<EntryInput[]> {
  const succeeded = await all<AttemptRow>("SELECT * FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded' AND id <> ?", intentId, including?.id ?? '')
  return [...succeeded, ...(including ? [including] : [])].map(a => ({ account: clearingFor(a.method, a.provider_account_id), amountMinor: a.amount_minor }))
}

/**
 * Settles a whole intent in the unit: intent succeeded, parts settled, every owner's settle handler,
 * one sealed posting and the event. Throws SettlementRefused when an owner refuses while building.
 */
async function settle(unit: UnitView, intent: IntentRow, parts: PartRow[], attempt: AttemptRow) {
  const at = nowMs()
  unit.add({ sql: "UPDATE payments_intents SET state = 'succeeded', settled_at = ?, updated_at = ? WHERE id = ? AND state = 'open'", params: [at, at, intent.id] })
    .expect(1, { code: 'payments.intent.not-open', reason: 'This payment is no longer open.' })
  unit.add({ sql: 'UPDATE payments_intent_parts SET settled_at = ? WHERE intent_id = ?', params: [at, intent.id] })
    .expect(parts.length)
  // Test money settles only Payments' own test payment, posts nothing, and never confirms a live sale.
  const test = await isTestMoney(intent.id, attempt)
  if (test && parts.some(p => p.owner_module !== 'payments')) throw new SettlementRefused('payments', new Refusal('payments.attempt.test-mode', 'A test payment cannot pay for a real sale.', { status: 409 }))
  const handlers = await settlements()
  const owned: EntryInput[] = []
  const rows = intent.channel === 'desk' ? await rowsOf(intent.id) : []
  const split = rows.filter(r => r.position > 0)
  for (const part of parts) {
    const handler = handlers.get(part.owner_module)
    if (!handler) throw new SettlementRefused(part.owner_module, new Error('the module that owns this part is not switched on'))
    let entries
    try {
      const splits = split.length ? splitsForPart(split, { module: part.owner_module, record: part.owner_record }) : []
      entries = await handler.settle(unit, { ...asPart(part, intent.currency), ...(splits.length ? { splits } : {}) })
    }
    catch (error) {
      throw new SettlementRefused(part.owner_module, error)
    }
    if (test) continue
    const total = entries.reduce((sum, e) => sum + e.amountMinor, 0)
    if (total !== -part.amount_minor) throw new SettlementRefused(part.owner_module, new Refusal('payments.settlement.part-mismatch', `${part.owner_module}'s ledger entries for its part total ${-total}, not the part's ${part.amount_minor}.`, { status: 500 }))
    owned.push(...await ownerEntries(entries, part.owner_module))
  }
  // Each receipt asked for at the till goes now the sale is whole, with any owner's link on it: one
  // person at a time, each in a unit of their own, so a sale shared by any number of people settles
  // in one small unit (an owner may give each person a record of their own as their receipt goes).
  if (!test && rows.some(r => r.receipt_sent_at === null && (r.receipt_to || r.receipt_account_id))) unit.enqueue('payments.till-receipts', { intentId: intent.id })
  if (!test) {
    try {
      await postEntries(unit, {
        key: `payments:intent:${intent.id}:paid`,
        source: { module: 'payments', type: 'payments.intent', id: intent.id },
        kind: 'sale',
        currency: intent.currency,
        postedBy: null,
        entries: [...await moneyLines(intent.id, attempt), ...owned],
      })
    }
    catch (error) {
      // An owner's entry reached an account that is not its own.
      if (isRefusal(error) && error.code === 'finance.entry.wrong-module') throw new SettlementRefused([...new Set(parts.map(p => p.owner_module))].join(', '), error)
      throw error
    }
  }
  unit.announce('payments.intent.succeeded', { intentId: intent.id, owners: ownersOf(parts) }, { record: ['payments.intent', intent.id] })
}

/**
 * Records an answer in the caller's unit of work. If it completes the intent, every part settles in
 * the same unit. Returns whether this answer settled the intent. An answer that repeats the state the
 * attempt is already in changes nothing.
 */
export async function applyAnswer(unit: UnitView, attempt: AttemptRow, answer: Answer, source: Source): Promise<{ changed: boolean, settled: boolean }> {
  if (attempt.state === answer.state || !FROM[answer.state].includes(attempt.state)) return { changed: false, settled: false }
  recordMove(unit, attempt, answer, source)
  if (answer.state === 'unknown') unit.announce('payments.attempt.unknown', { attemptId: attempt.id }, { record: ['payments.attempt', attempt.id] })
  const intent = (await getIntent(attempt.intent_id))!
  sessionChanged(unit, intent.session_id)
  if (answer.state !== 'succeeded') return { changed: true, settled: false }
  await postFee(unit, attempt, answer, intent.currency)
  if (intent.state === 'cancelled' || intent.state === 'expired') {
    // A seller gave up on this payment and the provider took it after all.
    await holdAndRefund(unit, intent, await partsOf(intent.id), [{ ...attempt, state: 'succeeded' }])
    return { changed: true, settled: false }
  }
  const paid = (await moneyLines(intent.id)).reduce((sum, l) => sum + l.amountMinor, 0) + attempt.amount_minor
  if (intent.state !== 'open' || paid !== intent.amount_minor) return { changed: true, settled: false }
  await settle(unit, intent, await partsOf(intent.id), attempt)
  return { changed: true, settled: true }
}

/**
 * Money taken for an intent that will never settle (cancelled or expired, so its parts are already
 * released): each attempt's money is held in payments.unfulfilled and refunded in full, asked for by
 * the system and so approved at once (Box office specification, part 4, abandoning a reader payment).
 */
export async function holdAndRefund(unit: UnitView, intent: IntentRow, parts: PartRow[], attempts: AttemptRow[]): Promise<string[]> {
  for (const attempt of attempts) {
    if (await isTestMoney(intent.id, attempt)) continue
    await postEntries(unit, {
      key: `payments:attempt:${attempt.id}:held`,
      source: { module: 'payments', type: 'payments.attempt', id: attempt.id },
      kind: 'unfulfilled',
      currency: intent.currency,
      postedBy: null,
      entries: [{ account: clearingFor(attempt.method, attempt.provider_account_id), amountMinor: attempt.amount_minor }, { account: { key: 'payments.unfulfilled' }, amountMinor: -attempt.amount_minor }],
    })
  }
  const refundIds = await refundInFull(unit, intent, parts, attempts)
  for (const refundId of refundIds) unit.enqueue('payments.send-refund', { refundId })
  return refundIds
}

/** Records an answer on its own: attempt succeeded, intent unfulfilled, the money held to go back. */
async function unfulfil(attempt: AttemptRow, answer: Answer, source: Source): Promise<void> {
  const unit = createUnit()
  const view = unit.view()
  recordMove(view, attempt, answer, source)
  const intent = (await getIntent(attempt.intent_id))!
  const parts = await partsOf(intent.id)
  view.add({ sql: "UPDATE payments_intents SET state = 'unfulfilled', updated_at = ? WHERE id = ? AND state = 'open'", params: [nowMs(), intent.id] })
    .expect(1, { code: 'payments.intent.not-open', reason: 'This payment is no longer open.' })
  const money = await moneyLines(intent.id, { ...attempt, state: 'succeeded' })
  const total = money.reduce((sum, l) => sum + l.amountMinor, 0)
  if (!await isTestMoney(intent.id, attempt)) await postEntries(view, {
    key: `payments:intent:${intent.id}:unfulfilled`,
    source: { module: 'payments', type: 'payments.intent', id: intent.id },
    kind: 'unfulfilled',
    currency: intent.currency,
    postedBy: null,
    entries: [...money, { account: { key: 'payments.unfulfilled' }, amountMinor: -total }],
  })
  await postFee(view, attempt, answer, intent.currency)
  await releaseParts(view, intent, parts)
  // The whole payment goes back, asked for by the system and so approved at once.
  const paid = await all<AttemptRow>("SELECT * FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded' AND id <> ? ORDER BY started_at", intent.id, attempt.id)
  const refundIds = await refundInFull(view, intent, parts, [...paid, attempt])
  for (const refundId of refundIds) view.enqueue('payments.send-refund', { refundId })
  view.announce('payments.intent.unfulfilled', { intentId: intent.id, owners: ownersOf(parts) }, { record: ['payments.intent', intent.id] })
  await unit.commit()
}

/** True when a failed commit was an owner refusing its part, rather than Payments' own guard or a fault. */
function ownerRefused(error: unknown, parts: PartRow[]): boolean {
  if (error instanceof SettlementRefused) return true
  if (!isRefusal(error)) return false
  const module = error.code.split('.')[0]
  return parts.some(p => p.owner_module === module)
}

/**
 * Records an answer and commits it, on its own unit of work. When a succeeded answer cannot be
 * settled because an owner refused (a hold released by hand, a sale gone), commits instead the
 * unfulfilled batch: the money is held in payments.unfulfilled and every part is released. Used by
 * the webhook job, the reconcile task and a person attesting or reconciling.
 */
export async function recordAnswer(attemptId: string, answer: Answer, source: Source): Promise<{ changed: boolean, settled: boolean, unfulfilled: boolean }> {
  const attempt = (await all<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptId))[0]
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  const unit = createUnit()
  try {
    const result = await applyAnswer(unit.view(), attempt, answer, source)
    if (result.changed) await unit.commit()
    return { ...result, unfulfilled: false }
  }
  catch (error) {
    if (answer.state !== 'succeeded') throw error
    const parts = await partsOf(attempt.intent_id)
    if (!ownerRefused(error, parts)) throw error
    // Nothing else keeps why the owner refused, and the payment is refunded in full because of it.
    const cause = error instanceof SettlementRefused ? error.cause : error
    log.warn('payments.settlement-refused', {
      intentId: attempt.intent_id,
      attemptId: attempt.id,
      module: error instanceof SettlementRefused ? error.module : (error as Refusal).code.split('.')[0],
      code: isRefusal(cause) ? cause.code : undefined,
      reason: String((cause as Error)?.message ?? cause),
    })
    await unfulfil(attempt, answer, source)
    return { changed: true, settled: false, unfulfilled: true }
  }
}

/** Writes a new attempt in `started`. A retry is a new attempt with a new key. */
export function addAttempt(unit: UnitView, input: { intentId: string, providerAccountId: string, method: Method, amountMinor: number, readerId?: string | null, tenderedMinor?: number | null, note?: string | null, idempotencyKey?: string }): AttemptRow {
  const id = newId('att')
  const at = nowMs()
  const row: AttemptRow = { id, intent_id: input.intentId, provider_account_id: input.providerAccountId, method: input.method, amount_minor: input.amountMinor, state: 'started', idempotency_key: input.idempotencyKey ?? `payments:attempt:${id}`, provider_ref: null, reader_id: input.readerId ?? null, started_at: at, refunded_minor: 0 }
  unit.add({
    sql: "INSERT INTO payments_attempts (id, intent_id, provider_account_id, method, amount_minor, state, idempotency_key, reader_id, tendered_minor, note, started_at, updated_at) VALUES (?, ?, ?, ?, ?, 'started', ?, ?, ?, ?, ?, ?)",
    params: [id, input.intentId, input.providerAccountId, input.method, input.amountMinor, row.idempotency_key, row.reader_id, input.tenderedMinor ?? null, input.note ?? null, at, at],
  })
  unit.add({ sql: "INSERT INTO payments_attempt_events (id, attempt_id, kind, source, at) VALUES (?, ?, 'started', 'system', ?)", params: [newId('ate'), id, at] })
  return row
}

/**
 * The provider's answer as this attempt can take it. An attempt already unknown cannot be cancelled,
 * so the provider saying it stopped means it was not paid.
 */
export function fitAnswer(attempt: AttemptRow, answer: ProviderAnswer): ProviderAnswer {
  if (attempt.state === 'unknown' && answer.state === 'cancelled') return { state: 'failed', providerRef: answer.providerRef, failureCode: 'cancelled' }
  return answer
}
