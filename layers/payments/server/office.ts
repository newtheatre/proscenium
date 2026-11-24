// Money received away from the desk (amendment P-A2): a bank transfer or cheque the treasurer records
// against something owed, such as an invoice. It is an Other payment with no till session, settled at
// once through the owner's settle handler, dated the day the money arrived. Several may be recorded
// for one record, because a debt can be paid in parts; the owner refuses an amount above what is owed.
import { instantOfLocal } from '#kit/clock'
import { newId, nowMs, Refusal, theatreTimeZone, today, useSetting, type UnitView } from '#kit'
import { postEntries, type EntryInput } from '#modules/finance'
import { addAttempt } from './answers'
import { createIntent, settlements } from './intents'
import { clearingFor } from './providers'
import { outsideAccounts } from './outside'
import { ownerEntries } from './owner-entries'

export interface ReceivedInput {
  owner: { module: string, record: string }
  amountMinor: number
  /** An Other payment-method account: where the money arrived, such as the bank account. */
  providerAccountId: string
  /** Theatre-local date the money arrived; not after today. */
  receivedOn: string
  /** The bank's reference or the cheque number. */
  reference: string
  by: string
}

/** Records money received for an owner's record and settles it in the caller's unit. */
export async function recordReceived(unit: UnitView, input: ReceivedInput): Promise<{ intentId: string }> {
  const reference = input.reference.trim()
  if (!reference) throw new Refusal('payments.received.no-reference', 'Give the bank reference or cheque number.', { status: 422, fields: { reference: 'payments.received.no-reference' } })
  if (input.receivedOn > await today()) throw new Refusal('payments.received.future', 'Money cannot have arrived after today.', { status: 422, fields: { receivedOn: 'payments.received.future' } })
  if (!(await outsideAccounts()).some(a => a.id === input.providerAccountId))
    throw new Refusal('payments.attempt.method-unavailable', 'That way of paying is not set up here.', { status: 409 })
  const handler = (await settlements()).get(input.owner.module)
  if (!handler) throw new Refusal('payments.owner.unknown', 'What this payment is for cannot take a payment.', { status: 409 })

  const at = nowMs()
  const currency = await useSetting('core.locale.currency') as string
  const { intentId, partIds } = await createIntent(unit, { parts: [{ owner: input.owner, amountMinor: input.amountMinor }], currency, channel: 'desk', expiresAt: at })
  const attempt = addAttempt(unit, { intentId, providerAccountId: input.providerAccountId, method: 'other_attested', amountMinor: input.amountMinor, note: reference })
  unit.add({
    sql: "UPDATE payments_attempts SET state = 'succeeded', answered_by = ?, answered_at = ?, updated_at = ? WHERE id = ? AND state = 'started'",
    params: [input.by, at, at, attempt.id],
  }).expect(1, { code: 'payments.attempt.already-answered', reason: 'This payment already has its answer.' })
  unit.add({ sql: "INSERT INTO payments_attempt_events (id, attempt_id, kind, source, by, at) VALUES (?, ?, 'attested_succeeded', 'person', ?, ?)", params: [newId('ate'), attempt.id, input.by, at] })
  unit.add({ sql: "UPDATE payments_intents SET state = 'succeeded', settled_at = ?, updated_at = ? WHERE id = ? AND state = 'open'", params: [at, at, intentId] }).expect(1)
  unit.add({ sql: 'UPDATE payments_intent_parts SET settled_at = ? WHERE intent_id = ?', params: [at, intentId] }).expect(1)

  const part = { id: partIds[0]!, intentId, record: input.owner.record, amountMinor: input.amountMinor, currency, receivedOn: input.receivedOn }
  const own = await handler.settle(unit, part)
  const total = own.reduce((sum, e) => sum + e.amountMinor, 0)
  if (total !== -input.amountMinor) throw new Refusal('payments.settlement.part-mismatch', `${input.owner.module}'s entries for this payment total ${-total}, not ${input.amountMinor}.`, { status: 500 })
  const entries: EntryInput[] = await ownerEntries(own, input.owner.module)
  await postEntries(unit, {
    key: `payments:intent:${intentId}:paid`,
    source: { module: 'payments', type: 'payments.intent', id: intentId },
    kind: 'sale',
    currency,
    postedBy: input.by,
    occurredAt: input.receivedOn === await today() ? at : instantOfLocal(input.receivedOn, '12:00', await theatreTimeZone()), // not-policy: midday, safely inside the day
    entries: [{ account: clearingFor('other_attested', input.providerAccountId), amountMinor: input.amountMinor }, ...entries],
  })
  unit.audit({ action: 'create', record: ['payments.intent', intentId], detail: { received: input.amountMinor } })
  unit.announce('payments.intent.succeeded', { intentId, owners: [{ moduleId: input.owner.module, recordId: input.owner.record }] }, { record: ['payments.intent', intentId] })
  return { intentId }
}
