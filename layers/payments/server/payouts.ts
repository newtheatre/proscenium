// Payouts and their fees, entered by hand (PAY-06, first release): what a provider paid into the bank
// and what it kept, from its statement. One posting moves the gross out of the account's clearing
// account, the payout into the bank and the fees into payments.provider-fees. The provider's payout
// reference keys the posting, so the same payout entered twice is refused the second time (and a
// race between two is refused by the posting's unique key).
import { first, Refusal, type UnitView } from '#kit'
import { postEntries } from '#modules/finance'
import { providerAccount, providers } from './providers'

export interface PayoutInput { providerAccountId: string, paidMinor: number, feesMinor: number, paidOn: string, reference: string, by: string }

// A date entered by hand is placed at noon UTC, which falls on that same date in any theatre's zone.
const NOON_UTC = 'T12:00:00Z' // not-policy: see above

export async function recordPayout(unit: UnitView, input: PayoutInput): Promise<string> {
  const account = await providerAccount(input.providerAccountId)
  if (!account) throw new Refusal('core.not-found', 'There is no such provider account.', { status: 404 })
  const provider = (await providers()).get(account.provider)
  if (!provider || provider.capabilities.includes('cash')) throw new Refusal('payments.payout.not-a-card-account', 'Payouts come from card providers, not cash.', { status: 422 })
  if (account.mode === 'test') throw new Refusal('payments.payout.test-mode', 'A test-mode account pays nothing out.', { status: 409 })
  if (input.paidMinor < 0 || input.feesMinor < 0 || input.paidMinor + input.feesMinor === 0) throw new Refusal('payments.payout.bad-amount', 'Enter what was paid in and what was kept, at least one above nothing.', { status: 422 })
  const occurredAt = Date.parse(input.paidOn + NOON_UTC)
  if (Number.isNaN(occurredAt)) throw new Refusal('payments.payout.bad-date', 'That is not a date.', { status: 422 })
  const entries = [
    { account: { key: 'payments.card-clearing', scope: account.id }, amountMinor: -(input.paidMinor + input.feesMinor) },
    ...(input.paidMinor ? [{ account: { key: 'payments.bank' }, amountMinor: input.paidMinor }] : []),
    ...(input.feesMinor ? [{ account: { key: 'payments.provider-fees' }, amountMinor: input.feesMinor }] : []),
  ]
  const key = `payments:payout:${account.id}:${input.reference}`
  if (await first('SELECT 1 FROM finance_postings WHERE idempotency_key = ?', key))
    throw new Refusal('payments.payout.already-entered', 'This payout has already been entered.', { status: 409 })
  return postEntries(unit, {
    key,
    source: { module: 'payments', type: 'payments.provider-account', id: account.id },
    kind: 'payout',
    occurredAt,
    postedBy: input.by,
    entries,
  })
}
