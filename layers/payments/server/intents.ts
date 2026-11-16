// Intents and their parts (Box office specification, part 3, "A payment"). An intent is the decision
// to collect an amount; its parts say whom it is for. The parts are written in the same batch as the
// intent, and a trigger refuses any part that would take them past the intent's amount, so after the
// batch the sum cannot drift. A record has at most one open intent collecting for it.
import { all, first, newId, nowMs, Refusal, useSetting, usePoint, type UnitView } from '#kit'
import { intentParts } from './db/schema'
import type { Part, Settlement } from './points/settlement'

export interface PartInput { owner: { module: string, record: string }, amountMinor: number }

export interface IntentInput {
  parts: PartInput[]
  currency?: string
  channel: 'online' | 'desk'
  expiresAt: number
  sessionId?: string
}

export interface IntentRow { id: string, amount_minor: number, currency: string, channel: 'online' | 'desk', state: string, expires_at: number, session_id: string | null, settled_at: number | null }
export interface PartRow { id: string, intent_id: string, owner_module: string, owner_record: string, open: number | null, amount_minor: number, refunded_minor: number, settled_at: number | null }

export async function getIntent(id: string): Promise<IntentRow | null> {
  return first<IntentRow>('SELECT * FROM payments_intents WHERE id = ?', id)
}

export async function partsOf(intentId: string): Promise<PartRow[]> {
  return all<PartRow>('SELECT * FROM payments_intent_parts WHERE intent_id = ? ORDER BY id', intentId)
}

export function asPart(row: PartRow, currency: string): Part {
  return { id: row.id, intentId: row.intent_id, record: row.owner_record, amountMinor: row.amount_minor, currency }
}

export function ownersOf(parts: PartRow[]): { moduleId: string, recordId: string }[] {
  return parts.map(p => ({ moduleId: p.owner_module, recordId: p.owner_record }))
}

/** The settlement handlers of the modules that are on, by owner module. */
export async function settlements(): Promise<Map<string, Settlement>> {
  const out = new Map<string, Settlement>()
  for (const c of await usePoint<Settlement>('payments.settlement')) {
    if (out.has(c.module)) throw new Error(`${c.module} contributes to payments.settlement twice; a module has one handler for all its parts`)
    out.set(c.module, c.value)
  }
  return out
}

/**
 * Adds an open intent and one part for each entry of `parts`. The intent's amount is the sum of its
 * parts, asserted by the batch's last statement. Refused if any of the records already has an open
 * intent; the unique index on open parts refuses a race the read did not see.
 */
export async function createIntent(unit: UnitView, input: IntentInput): Promise<{ intentId: string, partIds: string[] }> {
  if (!input.parts.length) throw new Error('An intent has at least one part')
  for (const part of input.parts) if (!Number.isSafeInteger(part.amountMinor) || part.amountMinor <= 0) throw new Refusal('payments.intent.bad-amount', 'Each part of a payment is a whole amount above zero.', { status: 422 })
  const keys = input.parts.map(p => `${p.owner.module}\u0000${p.owner.record}`)
  if (new Set(keys).size !== keys.length) throw new Error('An intent names each owner record once')
  const open = await all<{ owner_module: string, owner_record: string }>(
    'SELECT owner_module, owner_record FROM payments_intent_parts WHERE open = 1 AND (owner_module || char(0) || owner_record) IN (SELECT value FROM json_each(?))', JSON.stringify(keys))
  if (open.length) throw new Refusal('payments.intent.already-open', 'A payment is already being taken for this.', { status: 409, remedy: 'Finish or cancel that payment first.' })

  const currency = input.currency ?? await useSetting('core.locale.currency') as string
  const amount = input.parts.reduce((sum, p) => sum + p.amountMinor, 0)
  const intentId = newId('pay')
  const at = nowMs()
  unit.add({
    sql: "INSERT INTO payments_intents (id, amount_minor, currency, channel, state, expires_at, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)",
    params: [intentId, amount, currency, input.channel, input.expiresAt, input.sessionId ?? null, at, at],
  })
  const partIds = unit.insertSet(intentParts, input.parts.map(p => ({ intentId, ownerModule: p.owner.module, ownerRecord: p.owner.record, open: 1, amountMinor: p.amountMinor })))
  unit.expect(input.parts.length, { code: 'payments.intent.already-open', reason: 'A payment is already being taken for this.' })
  // The parts sum to the intent: the statement changes the intent's row only if they do.
  unit.add({ sql: 'UPDATE payments_intents SET updated_at = updated_at WHERE id = ? AND amount_minor = (SELECT sum(amount_minor) FROM payments_intent_parts WHERE intent_id = ?)', params: [intentId, intentId] })
    .expect(1, { code: 'payments.intent.parts-differ', reason: 'The parts of this payment do not add up to its total.' })
  return { intentId, partIds }
}

/** The online counterpart of the till, for an owner with its own checkout page. */
export function collect(unit: UnitView, input: Omit<IntentInput, 'channel' | 'sessionId'>): Promise<{ intentId: string, partIds: string[] }> {
  return createIntent(unit, { ...input, channel: 'online' })
}

/** Calls every owner's release for the parts of an intent that did not complete. */
export async function releaseParts(unit: UnitView, intent: IntentRow, parts: PartRow[]): Promise<void> {
  const handlers = await settlements()
  for (const part of parts) await handlers.get(part.owner_module)?.release?.(unit, asPart(part, intent.currency))
}

/** Cancels an open intent with no attempt pending, unknown or succeeded, and releases its parts. */
export async function cancelIntent(unit: UnitView, intentId: string): Promise<{ waiting: string[] }> {
  const intent = await getIntent(intentId)
  if (!intent) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  if (intent.state !== 'open') throw new Refusal('payments.intent.not-open', 'This payment is no longer open.', { status: 409 })
  // A payment still waiting for its answer may be given up on: the seller takes the money another way,
  // and if the provider takes it after all, it is held and refunded in full (answers.ts, holdAndRefund).
  unit.add({
    sql: `UPDATE payments_intents SET state = 'cancelled', updated_at = ? WHERE id = ? AND state = 'open'
      AND NOT EXISTS (SELECT 1 FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded')`,
    params: [nowMs(), intentId, intentId],
  }).expect(1, { code: 'payments.intent.paid-in-part', reason: 'Money has been taken for this payment, so it cannot be cancelled.', remedy: 'Take the rest, or refund what was taken.' })
  await releaseParts(unit, intent, await partsOf(intentId))
  const waiting = await all<{ id: string }>("SELECT id FROM payments_attempts WHERE intent_id = ? AND state IN ('started', 'pending', 'unknown')", intentId)
  return { waiting: waiting.map(w => w.id) }
}

export interface IntentStatus {
  id: string
  state: string
  amountMinor: number
  currency: string
  paidMinor: number
  waiting: boolean
  parts: { id: string, owner: { module: string, record: string }, amountMinor: number, refundedMinor: number, settled: boolean }[]
}

/** State, amounts paid and refunded by part, and whether anything is pending or unknown. */
export async function intentStatus(intentId: string): Promise<IntentStatus | null> {
  const intent = await getIntent(intentId)
  if (!intent) return null
  const attempts = await all<{ state: string, amount_minor: number }>('SELECT state, amount_minor FROM payments_attempts WHERE intent_id = ?', intentId)
  return {
    id: intent.id,
    state: intent.state,
    amountMinor: intent.amount_minor,
    currency: intent.currency,
    paidMinor: attempts.filter(a => a.state === 'succeeded').reduce((s, a) => s + a.amount_minor, 0),
    waiting: attempts.some(a => ['started', 'pending', 'unknown'].includes(a.state)),
    parts: (await partsOf(intentId)).map(p => ({ id: p.id, owner: { module: p.owner_module, record: p.owner_record }, amountMinor: p.amount_minor, refundedMinor: p.refunded_minor, settled: p.settled_at !== null })),
  }
}
