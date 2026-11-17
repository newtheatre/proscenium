// Charges (rules P1 to P5): what one membership owes, opened in the unit that writes its application,
// voided with it, and paid through Payments with the owner membership-fees.charge.
import { first, newId, nowMs, refuse, type UnitView } from '#kit'
import { cancelIntent, intentStatus } from '#modules/payments'
import type { ChargeKind, ChargeQuote, ChargeStatus } from '#modules/membership'
import { priceInForce } from './prices'

export interface ChargeRow { id: string, membership_id: string, amount_minor: number, currency: string, state: ChargeStatus['state'], intent_id: string | null, refunded_minor: number, paid_at: number | null }

/** The membership's charge that is not void. */
export function chargeOf(membershipId: string): Promise<ChargeRow | null> {
  return first<ChargeRow>("SELECT id, membership_id, amount_minor, currency, state, intent_id, refunded_minor, paid_at FROM membership_fees_charges WHERE membership_id = ? AND state <> 'void'", membershipId)
}

export async function openCharge(unit: UnitView, input: { membershipId: string, schemeId: string, lengthOptionId: string | null, kind: ChargeKind, on: string }): Promise<ChargeQuote> {
  const price = await priceInForce(input.schemeId, input.lengthOptionId, input.kind, input.on)
  // S5: never silently free.
  if (!price) refuse('membership-fees.price.none', 'This scheme has no fee set yet, so it cannot be joined online.', { status: 409, remedy: 'Contact the theatre to join.' })
  const at = nowMs()
  unit.add({
    sql: "INSERT INTO membership_fees_charges (id, membership_id, price_id, amount_minor, currency, tax_code, state, refunded_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 0, ?, ?)",
    params: [newId('mfc'), input.membershipId, price!.priceId, price!.amountMinor, price!.currency, price!.taxCode, at, at],
  }).expect(1, { code: 'membership-fees.charge.exists', reason: 'This membership has already been charged.' })
  return { priceId: price!.priceId, amountMinor: price!.amountMinor, currency: price!.currency }
}

/** Voids an open charge, cancelling a payment still being taken for it. A paid charge is left alone. */
export async function voidCharge(unit: UnitView, membershipId: string): Promise<void> {
  const charge = await chargeOf(membershipId)
  if (!charge || charge.state !== 'open') return
  const intent = charge.intent_id ? await intentStatus(charge.intent_id) : null
  if (intent?.state === 'open') await cancelIntent(unit, charge.intent_id!)
  unit.add({ sql: "UPDATE membership_fees_charges SET state = 'void', intent_id = NULL, updated_at = ? WHERE id = ? AND state = 'open'", params: [nowMs(), charge.id] })
}
