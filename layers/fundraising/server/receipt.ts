// A gift received (rule D8, M1): the donation takes its reference and date in Payments' batch, the
// money goes to its fund's donations account, and the donor is thanked once, after the commit.
import { first, localDate, nowMs, refuse, type UnitView } from '#kit'
import { notify, notifyAddress } from '#modules/core'
import type { OwnerEntry, Part } from '#modules/payments'
import { wordsFor } from './words'

export interface DonationRow { id: string, account_id: string | null, contact_email: string | null, amount_minor: number, refunded_minor: number, currency: string, fund_id: string, campaign_id: string | null, production_id: string | null, channel: string, state: string, intent_id: string | null, reference: string | null }

// The next reference in turn: G-1001, then G-1002. The batch's unique index refuses a clash.
const NEXT_REFERENCE = "'G-' || (SELECT coalesce(max(CAST(substr(reference, 3) AS INTEGER)), 1000) + 1 FROM fundraising_donations WHERE reference IS NOT NULL)" // not-policy: the prefix's length and the first number

const NOT_WAITING = { code: 'fundraising.donation.not-waiting', reason: 'This gift is no longer waiting for this payment.' }

export const donationFor = (part: Part) => first<DonationRow>(
  'SELECT id, account_id, contact_email, amount_minor, refunded_minor, currency, fund_id, campaign_id, production_id, channel, state, intent_id, reference FROM fundraising_donations WHERE id = ?', part.record)

export const fundAccount = (fundId: string) => ({ key: 'fundraising.donations', scope: fundId })

async function thank(unit: UnitView, gift: DonationRow, receivedOn: string): Promise<void> {
  const fund = await first<{ name: string }>('SELECT name FROM fundraising_funds WHERE id = ?', gift.fund_id)
  const variables = { ...await wordsFor(gift.amount_minor, gift.currency, receivedOn), fund: fund?.name ?? '' }
  const record = ['fundraising.donation', gift.id] as const
  if (gift.account_id) await notify(unit, 'fundraising.donation-thanks', { to: gift.account_id, variables, dedupeKey: gift.id, subject: record })
  else if (gift.contact_email) await notifyAddress(unit, 'fundraising.donation-thanks', { address: gift.contact_email, variables, dedupeKey: gift.id, record })
}

/** Payments' settle: the pending gift is received, its reference the next in turn. */
export async function receive(unit: UnitView, part: Part): Promise<OwnerEntry[]> {
  const gift = await donationFor(part)
  if (!gift || gift.state !== 'pending' || gift.intent_id !== part.intentId || gift.amount_minor !== part.amountMinor)
    refuse(NOT_WAITING.code, NOT_WAITING.reason, { status: 409 })
  const receivedOn = await localDate()
  unit.add({
    sql: `UPDATE fundraising_donations SET state = 'received', received_on = ?, updated_at = ?,
      reference = ${NEXT_REFERENCE}
      WHERE id = ? AND state = 'pending' AND intent_id = ?`,
    params: [receivedOn, nowMs(), gift!.id, part.intentId],
  }).expect(1, NOT_WAITING)
  unit.announce('fundraising.donation.received', {
    donationId: gift!.id, fundId: gift!.fund_id, campaignId: gift!.campaign_id, productionId: gift!.production_id,
    amountMinor: gift!.amount_minor, channel: gift!.channel,
  }, { record: ['fundraising.donation', gift!.id] })
  await thank(unit, gift!, receivedOn)
  return [{ account: fundAccount(gift!.fund_id), amountMinor: -part.amountMinor, productionId: gift!.production_id }]
}
