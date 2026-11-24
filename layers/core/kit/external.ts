// externalCall: the one way to call an outside service that cannot be undone, and the one
// self-committing exception to the unit of work (X1 to X4). The attempt is committed before the
// call; the outcome is committed after it as a second unit. A call that times out leaves an attempt
// with no outcome, which the module's reconcile handler settles later. Nothing is shown as done
// before its outcome commits, because the module's records change only in the outcome's unit.
import { useContext } from './context'
import { useRegistry } from './registry'
import { createUnit, type RecordRef, type UnitView } from './unit'
import { newId } from './ids'
import { nowMs } from './clock'
import { useSetting } from './settings-store'
import { parseDuration } from './duration'
import { isRefusal, Refusal } from './refusal'
import { log } from './log'
import { isPractice } from './practice/gate'
import type { CallAttempt, CallOutcome } from './handlers'

export interface ExternalCallResult { state: 'succeeded' | 'failed' | 'unknown', outcome?: CallOutcome, attempt: CallAttempt }

function refString(record: RecordRef): string {
  return Array.isArray(record) ? `${record[0]}:${record[1]}` : `${(record as any).type}:${(record as any).id}`
}

function lookup(name: string) {
  const registry = useRegistry()
  const declared = registry.calls.get(name)
  if (!declared) throw new Error(`"${name}" is not a declared external call`)
  const handler = registry.modules.get(declared.module)!.handlers.calls?.[name]
  if (!handler) throw new Error(`${name} has no handler in server/calls/`)
  return { ...declared, handler }
}

type Row = { id: string, purpose: string, reference: string, idempotency_key: string, phase: string, result: string | null, provider_reference: string | null, at: number }
const asAttempt = (row: Row): CallAttempt => ({ id: row.id, name: row.purpose, reference: row.reference, idempotencyKey: row.idempotency_key, at: row.at })

async function rowsFor(key: string): Promise<{ attempt?: Row, outcome?: Row }> {
  const { env } = useContext()
  const rows = await env.DB.prepare("SELECT * FROM core_external_calls WHERE idempotency_key = ? AND (phase = 'attempt' OR (phase = 'outcome' AND result != 'unknown'))").bind(key).all<Row>()
  return { attempt: rows.results.find(r => r.phase === 'attempt'), outcome: rows.results.find(r => r.phase === 'outcome') }
}

/**
 * Calls an outside service once, safely. `key` is the idempotency key sent to the provider; a
 * retry with the same reference reuses it, so the provider never acts twice (X2).
 */
export async function externalCall(name: string, options: {
  reference: RecordRef
  key?: string
  /** Statements committed with the attempt, such as marking an intent as pending. */
  attempt?: (unit: UnitView) => void | Promise<void>
  /** The outside call itself. Throwing or timing out leaves the outcome unknown. */
  call: (idempotencyKey: string) => Promise<CallOutcome>
}): Promise<ExternalCallResult> {
  const { module, handler } = lookup(name)
  const reference = refString(options.reference)
  const key = options.key ?? `${name}:${reference}`
  const found = await rowsFor(key)
  const outcome = found.outcome
  let attempt = found.attempt
  if (attempt && outcome) return { state: outcome.result as 'succeeded' | 'failed', outcome: { result: outcome.result as any, providerReference: outcome.provider_reference ?? undefined }, attempt: asAttempt(attempt) }
  if (isPractice() && !handler.practice) throw new Refusal('core.practice.no-outside-calls', 'Nothing leaves practice.', { status: 409, remedy: 'This step cannot be practised.' })

  if (!attempt) {
    const unit = createUnit()
    const id = newId('ext')
    await options.attempt?.(unit.view())
    unit.add({ sql: "INSERT OR IGNORE INTO core_external_calls (id, module_id, purpose, reference, idempotency_key, phase, at) VALUES (?, ?, ?, ?, ?, 'attempt', ?)", params: [id, module, name, reference, key, nowMs()] })
      .expect(1, { code: 'core.external.in-progress', reason: 'This call is already being made.' })
    try { await unit.commit() }
    catch (error) {
      if (!(isRefusal(error) && error.code === 'core.external.in-progress')) throw error
    }
    attempt = (await rowsFor(key)).attempt!
  }

  if (isPractice()) return practiseCall(name, attempt, handler, module)
  const timeout = await useSetting('core.external.timeout') as number
  let result: CallOutcome
  try {
    result = await Promise.race([
      options.call(key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), timeout * 1000)), // not-policy: seconds to milliseconds
    ])
    if (result?.result !== 'succeeded' && result?.result !== 'failed') throw new Error('The call returned no result')
  }
  catch (error) {
    log.warn('core.external.unknown', { call: name, attemptId: attempt.id, error: String((error as Error)?.message ?? error) })
    return { state: 'unknown', attempt: asAttempt(attempt) }
  }
  return settle(name, attempt, result, handler, module)
}

/** The call's practice answer, recorded in the store and settled as the provider's would be (O1). */
async function practiseCall(name: string, attempt: Row, handler: ReturnType<typeof lookup>['handler'], module: string): Promise<ExternalCallResult> {
  const answer = await handler.practice!(asAttempt(attempt))
  const { env } = useContext()
  await env.DB.prepare('INSERT INTO core_practice_calls (id, attempt_id, call, reference, answer, chosen_by, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('pca'), attempt.id, name, attempt.reference, answer === 'ask-trainee' ? 'waiting' : answer.result, answer === 'ask-trainee' ? 'trainee' : 'default', nowMs()).run()
  if (answer === 'ask-trainee') return { state: 'unknown', attempt: asAttempt(attempt) }
  return settle(name, attempt, answer, handler, module)
}

/** Settles a practice call the trainee answered on the practice card reader (PM-S7). */
export async function answerPracticeCall(attemptId: string, outcome: CallOutcome): Promise<ExternalCallResult> {
  if (!isPractice()) throw new Error('Only a practice call can be answered by the trainee')
  const { env } = useContext()
  const attempt = await env.DB.prepare("SELECT * FROM core_external_calls WHERE id = ? AND phase = 'attempt'").bind(attemptId).first<Row>()
  if (!attempt) throw new Refusal('core.not-found', 'There is nothing here.', { status: 404 })
  const { handler, module } = lookup(attempt.purpose)
  await env.DB.prepare('INSERT INTO core_practice_calls (id, attempt_id, call, reference, answer, chosen_by, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('pca'), attempt.id, attempt.purpose, attempt.reference, outcome.result, 'trainee', nowMs()).run()
  return settle(attempt.purpose, attempt, outcome, handler, module)
}

async function settle(name: string, attempt: Row, result: CallOutcome, handler: ReturnType<typeof lookup>['handler'], module: string): Promise<ExternalCallResult> {
  const unit = createUnit()
  await handler.outcome(unit.view(), result, asAttempt(attempt))
  unit.add({ sql: "INSERT OR IGNORE INTO core_external_calls (id, module_id, purpose, reference, idempotency_key, phase, result, provider_reference, at) VALUES (?, ?, ?, ?, ?, 'outcome', ?, ?, ?)", params: [newId('ext'), module, name, attempt.reference, attempt.idempotency_key, result.result, result.providerReference ?? null, nowMs()] })
    .expect(1, { code: 'core.external.settled', reason: 'This call has already been settled.' })
  try {
    await unit.commit()
  }
  catch (error) {
    if (!(isRefusal(error) && error.code === 'core.external.settled')) throw error
    const { outcome } = await rowsFor(attempt.idempotency_key)
    return { state: outcome!.result as any, outcome: { result: outcome!.result as any, providerReference: outcome!.provider_reference ?? undefined }, attempt: asAttempt(attempt) }
  }
  return { state: result.result, outcome: result, attempt: asAttempt(attempt) }
}

/** Hands every attempt with no outcome, older than its call's reconcile-after, to its reconcile handler. */
export async function reconcileDue(at = nowMs()): Promise<number> {
  const { env } = useContext()
  const registry = useRegistry()
  if (!registry.calls.size) return 0
  const fallback = await useSetting('core.external.reconcile-after') as number
  const rows = await env.DB.prepare(`SELECT a.* FROM core_external_calls a WHERE a.phase = 'attempt'
    AND NOT EXISTS (SELECT 1 FROM core_external_calls o WHERE o.idempotency_key = a.idempotency_key AND o.phase = 'outcome' AND o.result != 'unknown')
    ORDER BY a.at LIMIT 20`).all<Row>() // not-policy: a batch per minute
  let settled = 0
  for (const row of rows.results) {
    const declared = registry.calls.get(row.purpose)
    if (!declared) continue
    const after = declared.decl.reconcileAfter ? parseDuration(declared.decl.reconcileAfter) : fallback
    if (row.at > at - after * 1000) continue // not-policy: seconds to milliseconds
    const { handler, module } = lookup(row.purpose)
    try {
      const answer = await handler.reconcile(asAttempt(row))
      if (answer === 'unknown') continue
      await settle(row.purpose, row, answer, handler, module)
      settled++
    }
    catch (error) {
      log.warn('core.external.reconcile-failed', { call: row.purpose, attemptId: row.id, error: String((error as Error)?.message ?? error) })
    }
  }
  return settled
}
