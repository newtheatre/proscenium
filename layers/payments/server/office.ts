// Money received away from the desk (amendment P-A2): a bank transfer or cheque the treasurer records
// against something owed, such as an invoice. It is an Other payment with no till session, settled at
// once through the owner's settle handler, dated the day the money arrived. Several may be recorded
// for one record, because a debt can be paid in parts; the owner refuses an amount above what is owed.
import { instantOfLocal } from '#kit/clock'
import { nowMs, Refusal, theatreTimeZone, today, useSetting, type UnitView } from '#kit'
import { addAttempt } from './answers'
import { attestSucceeded, postAttested } from './attested'
import { createIntent, settlements } from './intents'
import { outsideAccounts } from './outside'

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
  attestSucceeded(unit, attempt.id, input.by, at)
  unit.add({ sql: "UPDATE payments_intents SET state = 'succeeded', settled_at = ?, updated_at = ? WHERE id = ? AND state = 'open'", params: [at, at, intentId] }).expect(1)
  unit.add({ sql: 'UPDATE payments_intent_parts SET settled_at = ? WHERE intent_id = ?', params: [at, intentId] }).expect(1)

  const part = { id: partIds[0]!, intentId, record: input.owner.record, amountMinor: input.amountMinor, currency, receivedOn: input.receivedOn }
  const own = await handler.settle(unit, part)
  const occurredAt = input.receivedOn === await today() ? at : instantOfLocal(input.receivedOn, '12:00', await theatreTimeZone()) // not-policy: midday, safely inside the day
  await postAttested(unit, { intentId, owner: input.owner, amountMinor: input.amountMinor, currency, providerAccountId: input.providerAccountId, by: input.by, occurredAt, detail: { received: input.amountMinor } }, own)
  return { intentId }
}
