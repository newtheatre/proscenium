// Answers to attempts, and settling (Box office specification, part 3, "A payment" and "Settling").
// Nothing is written as paid before an answer, and every answer has a source: the provider, a named
// person or the system. When an answer makes the intent whole, every part's owner settles in the same
// batch and Payments writes one sealed posting: the money received, plus each owner's entries. If an
// owner refuses after the money was taken, nothing settles and the intent becomes unfulfilled.
import { all, createUnit, isRefusal, newId, nowMs, Refusal, useContext, type UnitView } from '#kit'
import { postEntries, type EntryInput } from '#modules/finance'
import { asPart, getIntent, ownersOf, partsOf, releaseParts, settlements, type IntentRow, type PartRow } from './intents'
import { clearingFor } from './providers'
import type { Method, ProviderAnswer } from './points/provider'

export type AttemptState = 'started' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
export interface AttemptRow { id: string, intent_id: string, provider_account_id: string, method: Method, amount_minor: number, state: AttemptState, idempotency_key: string, provider_ref: string | null, reader_id: string | null }

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
export class SettlementRefused extends Error {
  constructor(readonly module: string, readonly cause: unknown) {
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
    sql: `UPDATE payments_attempts SET state = ?, provider_ref = coalesce(?, provider_ref), fee_minor = coalesce(?, fee_minor), failure_code = ?, answered_by = coalesce(?, answered_by), answered_at = ?, updated_at = ?
      WHERE id = ? AND state IN (SELECT value FROM json_each(?))`,
    params: [answer.state, 'providerRef' in answer ? answer.providerRef ?? null : null, answer.state === 'succeeded' ? answer.feeMinor ?? null : null, answer.state === 'failed' ? answer.failureCode : null, by, answer.state === 'pending' ? null : at, at, attempt.id, JSON.stringify(from)],
  }).expect(1, { code: 'payments.attempt.already-answered', reason: 'This payment already has its answer.' })
  unit.add({
    sql: 'INSERT INTO payments_attempt_events (id, attempt_id, kind, source, webhook_event_id, by, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [newId('ate'), attempt.id, eventKind(answer, source), source.kind, source.kind === 'webhook' ? source.webhookEventId : null, by, at],
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
  const handlers = await settlements()
  const owned: EntryInput[] = []
  for (const part of parts) {
    const handler = handlers.get(part.owner_module)
    if (!handler) throw new SettlementRefused(part.owner_module, new Error('the module that owns this part is not switched on'))
    let entries
    try {
      entries = await handler.settle(unit, asPart(part, intent.currency))
    }
    catch (error) {
      throw new SettlementRefused(part.owner_module, error)
    }
    const total = entries.reduce((sum, e) => sum + e.amountMinor, 0)
    if (total !== -part.amount_minor) throw new SettlementRefused(part.owner_module, new Refusal('payments.settlement.part-mismatch', `${part.owner_module}'s ledger entries for its part total ${-total}, not the part's ${part.amount_minor}.`, { status: 500 }))
    for (const e of entries) owned.push({ account: e.account, amountMinor: e.amountMinor, forModule: part.owner_module, productionId: e.productionId ?? null, performanceId: e.performanceId ?? null })
  }
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
  if (answer.state !== 'succeeded') return { changed: true, settled: false }
  const intent = (await getIntent(attempt.intent_id))!
  const paid = (await moneyLines(intent.id)).reduce((sum, l) => sum + l.amountMinor, 0) + attempt.amount_minor
  if (intent.state !== 'open' || paid !== intent.amount_minor) return { changed: true, settled: false }
  await settle(unit, intent, await partsOf(intent.id), attempt)
  return { changed: true, settled: true }
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
  await postEntries(view, {
    key: `payments:intent:${intent.id}:unfulfilled`,
    source: { module: 'payments', type: 'payments.intent', id: intent.id },
    kind: 'unfulfilled',
    currency: intent.currency,
    postedBy: null,
    entries: [...money, { account: { key: 'payments.unfulfilled' }, amountMinor: -total }],
  })
  await releaseParts(view, intent, parts)
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
    await unfulfil(attempt, answer, source)
    return { changed: true, settled: false, unfulfilled: true }
  }
}

/** Writes a new attempt in `started`. A retry is a new attempt with a new key. */
export function addAttempt(unit: UnitView, input: { intentId: string, providerAccountId: string, method: Method, amountMinor: number, readerId?: string | null, tenderedMinor?: number | null, idempotencyKey?: string }): AttemptRow {
  const id = newId('att')
  const row: AttemptRow = { id, intent_id: input.intentId, provider_account_id: input.providerAccountId, method: input.method, amount_minor: input.amountMinor, state: 'started', idempotency_key: input.idempotencyKey ?? `payments:attempt:${id}`, provider_ref: null, reader_id: input.readerId ?? null }
  const at = nowMs()
  unit.add({
    sql: "INSERT INTO payments_attempts (id, intent_id, provider_account_id, method, amount_minor, state, idempotency_key, reader_id, tendered_minor, started_at, updated_at) VALUES (?, ?, ?, ?, ?, 'started', ?, ?, ?, ?, ?)",
    params: [id, input.intentId, input.providerAccountId, input.method, input.amountMinor, row.idempotency_key, row.reader_id, input.tenderedMinor ?? null, at, at],
  })
  unit.add({ sql: "INSERT INTO payments_attempt_events (id, attempt_id, kind, source, at) VALUES (?, ?, 'started', 'system', ?)", params: [newId('ate'), id, at] })
  return row
}
