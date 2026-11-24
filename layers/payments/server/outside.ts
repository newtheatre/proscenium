// Money taken outside the site for something that lapsed unpaid (Box office specification, part 4,
// "A payment taken outside the site"), such as a card taken in the provider's own app when the till
// could not reach the reader. It is recorded as an Other payment and kept: the owner books the income
// through its `kept` handler, the record itself staying as it is, all in the caller's unit.
import { all, newId, nowMs, Refusal, useSetting, type UnitView } from '#kit'
import { postEntries, type EntryInput } from '#modules/finance'
import { addAttempt } from './answers'
import { createIntent, settlements } from './intents'
import { clearingFor, methodsFor } from './providers'
import { ownerEntries } from './owner-entries'

export interface OutsideInput {
  owner: { module: string, record: string }
  amountMinor: number
  providerAccountId: string
  /** How and when it was taken, such as "SumUp app, 14:20, card ending 1234". */
  note: string
  by: string
}

const ALREADY = { code: 'payments.outside.already-paid', reason: 'A payment for this is already recorded.' }

/** The accounts a payment taken outside the site may be recorded against: the desk's Other payments. */
export async function outsideAccounts(): Promise<{ id: string, label: string }[]> {
  return (await methodsFor('desk')).filter(m => m.method === 'other_attested' && m.mode === 'live').map(m => ({ id: m.providerAccountId, label: m.label }))
}

export async function recordTakenOutside(unit: UnitView, input: OutsideInput): Promise<{ intentId: string, attemptId: string }> {
  const note = input.note.trim()
  if (!note) throw new Refusal('payments.outside.no-note', 'Say how and when the money was taken.', { status: 422, fields: { note: 'payments.outside.no-note' } })
  if (!(await outsideAccounts()).some(a => a.id === input.providerAccountId))
    throw new Refusal('payments.attempt.method-unavailable', 'That way of paying is not set up here.', { status: 409 })
  const handler = (await settlements()).get(input.owner.module)
  if (!handler?.kept) throw new Refusal('payments.keep.owner-cannot', 'What this payment was for cannot be completed afterwards.', { status: 409 })
  const paid = await all<{ id: string }>(
    'SELECT id FROM payments_intent_parts WHERE owner_module = ? AND owner_record = ? AND settled_at IS NOT NULL AND refunded_minor < amount_minor', input.owner.module, input.owner.record)
  if (paid.length) throw new Refusal(ALREADY.code, ALREADY.reason, { status: 409 })

  const at = nowMs()
  const currency = await useSetting('core.locale.currency') as string
  const { intentId, partIds } = await createIntent(unit, { parts: [{ owner: input.owner, amountMinor: input.amountMinor }], currency, channel: 'desk', expiresAt: at })
  const attempt = addAttempt(unit, { intentId, providerAccountId: input.providerAccountId, method: 'other_attested', amountMinor: input.amountMinor, note })
  unit.add({
    sql: "UPDATE payments_attempts SET state = 'succeeded', answered_by = ?, answered_at = ?, updated_at = ? WHERE id = ? AND state = 'started'",
    params: [input.by, at, at, attempt.id],
  }).expect(1, { code: 'payments.attempt.already-answered', reason: 'This payment already has its answer.' })
  unit.add({ sql: "INSERT INTO payments_attempt_events (id, attempt_id, kind, source, by, at) VALUES (?, ?, 'attested_succeeded', 'person', ?, ?)", params: [newId('ate'), attempt.id, input.by, at] })
  // Another payment for the same record settled since the read: this one is refused whole.
  unit.add({
    sql: `UPDATE payments_intents SET state = 'succeeded', settled_at = ?, updated_at = ? WHERE id = ? AND state = 'open'
      AND NOT EXISTS (SELECT 1 FROM payments_intent_parts WHERE owner_module = ? AND owner_record = ? AND intent_id <> ? AND settled_at IS NOT NULL AND refunded_minor < amount_minor)`,
    params: [at, at, intentId, input.owner.module, input.owner.record, intentId],
  }).expect(1, ALREADY)
  unit.add({ sql: 'UPDATE payments_intent_parts SET settled_at = ? WHERE intent_id = ?', params: [at, intentId] }).expect(1, ALREADY)

  const part = { id: partIds[0]!, intentId, record: input.owner.record, amountMinor: input.amountMinor, currency }
  const own = await handler.kept(unit, part)
  const total = own.reduce((sum, e) => sum + e.amountMinor, 0)
  if (total !== -input.amountMinor) throw new Refusal('payments.settlement.part-mismatch', `${input.owner.module}'s entries for this payment total ${-total}, not ${input.amountMinor}.`, { status: 500 })
  const entries: EntryInput[] = await ownerEntries(own, input.owner.module)
  await postEntries(unit, {
    key: `payments:intent:${intentId}:paid`,
    source: { module: 'payments', type: 'payments.intent', id: intentId },
    kind: 'sale',
    currency,
    postedBy: input.by,
    entries: [{ account: clearingFor('other_attested', input.providerAccountId), amountMinor: input.amountMinor }, ...entries],
  })
  unit.audit({ action: 'create', record: ['payments.intent', intentId], detail: { outside: input.amountMinor } })
  unit.announce('payments.intent.succeeded', { intentId, owners: [{ moduleId: input.owner.module, recordId: input.owner.record }] }, { record: ['payments.intent', intentId] })
  return { intentId, attemptId: attempt.id }
}
