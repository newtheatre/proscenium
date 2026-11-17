// Paying one's own fee online (rules A2, P3; tab 5, "Pay"). The application is the holder's own,
// waiting only for its fee: nobody is asked to pay for a membership they may be refused. Paying opens
// a payment intent through Payments' collect, owner membership-fees.charge, then starts it with the
// first online method; a second press reuses the open intent.
import { first, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { collect, intentStatus, methodsFor, refreshIntent, startAttempt, type StartResult } from '#modules/payments'
import { chargeOf, type ChargeRow } from './charges'

export interface Application { id: string, schemeName: string, state: string, waitingOnStaff: boolean, expiresAt: number | null }

/** The holder's own application, or a 404. */
export async function ownApplication(membershipId: string, accountId: string): Promise<Application> {
  const row = await first<{ id: string, schemeName: string, state: string, waitingOnStaff: number, expiresAt: number | null }>(
    `SELECT m.id, s.name AS schemeName, m.state, (m.needs_verification = 1 AND m.verified_at IS NULL) AS waitingOnStaff, m.expires_at AS expiresAt
       FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.id = ?1 AND m.account_id IN (${accountScopeSql('?2')})`,
    membershipId, accountId,
  )
  if (!row) refuse('core.not-found', 'You have no application with that reference.', { status: 404 })
  return { ...row!, waitingOnStaff: !!row!.waitingOnStaff }
}

/** A2, P3: the charge, if this application is waiting for it now. */
async function payable(membershipId: string, accountId: string): Promise<ChargeRow> {
  const application = await ownApplication(membershipId, accountId)
  const charge = await chargeOf(membershipId)
  if (application.state !== 'pending' || !charge || charge.state !== 'open') refuse('membership-fees.pay.not-waiting', 'This membership is not waiting for a payment.', { status: 409 })
  if (application.waitingOnStaff) refuse('membership-fees.pay.not-yet', 'The theatre is still checking your application. You will be asked to pay once it has.', { status: 409 })
  return charge!
}

/** Opens the payment for the charge, or reuses the one still open. */
export async function openPayment(unit: UnitView, membershipId: string, accountId: string): Promise<{ intentId: string, amountMinor: number, currency: string, fresh: boolean }> {
  const charge = await payable(membershipId, accountId)
  if (charge.intent_id && (await intentStatus(charge.intent_id))?.state === 'open') return { intentId: charge.intent_id, amountMinor: charge.amount_minor, currency: charge.currency, fresh: false }
  const expiresAt = nowMs() + (await useSetting('membership-fees.checkout.pay-within') as number) * 1000 // not-policy: seconds to milliseconds
  const { intentId } = await collect(unit, { parts: [{ owner: { module: 'membership-fees', record: charge.id }, amountMinor: charge.amount_minor }], currency: charge.currency, expiresAt })
  unit.add({ sql: "UPDATE membership_fees_charges SET intent_id = ?, channel = 'online', updated_at = ? WHERE id = ? AND state = 'open'", params: [intentId, nowMs(), charge.id] })
    .expect(1, { code: 'membership-fees.pay.not-waiting', reason: 'This membership is not waiting for a payment.' })
  return { intentId, amountMinor: charge.amount_minor, currency: charge.currency, fresh: true }
}

/** Starts the payment with the first online method Payments offers. */
export async function startPayment(membershipId: string, accountId: string, origin: string): Promise<StartResult> {
  const charge = await payable(membershipId, accountId)
  if (!charge.intent_id) refuse('membership-fees.pay.not-open', 'Press Pay again to start the payment.', { status: 409 })
  const offers = await methodsFor('online')
  if (!offers.length) refuse('membership-fees.pay.no-method', 'Online payment is not set up here.', { status: 409, remedy: 'Contact the theatre to pay.' })
  return startAttempt(charge.intent_id!, { method: offers[0]!.method, providerAccountId: offers[0]!.providerAccountId, origin })
}

/** Back from paying: asks the provider now rather than waiting for its webhook. */
export async function checkPayment(membershipId: string, accountId: string): Promise<void> {
  await ownApplication(membershipId, accountId)
  const charge = await chargeOf(membershipId)
  if (charge?.state === 'open' && charge.intent_id) await refreshIntent(charge.intent_id)
}
