// Giving online (FR-07, rules D1, D4, D5): the Give page's choices, a gift started as a pending
// donation with a payment of its own, and the thanks page opened by the link the browser keeps. The
// link is a token handed out once; only its keyed hash is stored (Foundations, T1 to T5).
import { z } from 'zod'
import { all, first, linkTokens, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { collect, intentStatus, methodsFor, refreshIntent, startAttempt, type StartResult } from '#modules/payments'
import { defaultFund, getFund } from './funds'

export const giveFields = z.object({
  amountMinor: z.number().int().min(1),
  fundId: z.string().optional(),
  name: z.string().trim().max(120).optional(), // not-policy: shape bound
  email: z.string().trim().email().max(254).optional(), // not-policy: the longest address the mail standards allow
  acknowledgeAs: z.string().trim().max(60).optional(), // not-policy: the column's bound
  message: z.string().trim().max(500).optional(), // not-policy: the column's bound
}).strict()
export type GiveFields = z.infer<typeof giveFields>

export interface GiveOptions { presets: number[], minMinor: number, maxMinor: number, currency: string, online: boolean, funds: { id: string, name: string, purpose: string | null, isDefault: boolean }[] }

export async function giveOptions(): Promise<GiveOptions> {
  const funds = await all<{ id: string, name: string, purpose: string | null, isDefault: number }>(
    "SELECT id, name, purpose, is_default AS isDefault FROM fundraising_funds WHERE state = 'active' AND (offered = 1 OR is_default = 1) ORDER BY is_default DESC, sort, name")
  return {
    presets: await useSetting('fundraising.giving.presets') as number[],
    minMinor: await useSetting('fundraising.giving.min') as number,
    maxMinor: await useSetting('fundraising.giving.max') as number,
    currency: await useSetting('core.locale.currency') as string,
    online: (await methodsFor('online')).length > 0,
    funds: funds.map(f => ({ ...f, isDefault: !!f.isDefault })),
  }
}

async function checkAmount(amountMinor: number) {
  const min = await useSetting('fundraising.giving.min') as number
  const max = await useSetting('fundraising.giving.max') as number
  if (amountMinor < min) refuse('fundraising.give.too-small', 'That is less than the smallest gift we can take online.', { status: 422, fields: { amountMinor: 'fundraising.give.too-small' } })
  if (amountMinor > max) refuse('fundraising.give.too-large', 'That is more than we can take online.', { status: 422, fields: { amountMinor: 'fundraising.give.too-large' }, remedy: 'Contact the theatre to give a larger amount.' })
}

/** D4: a fund the donor chose among those offered, or the default. */
async function fundFor(fundId: string | undefined): Promise<string> {
  if (!fundId) return (await defaultFund() ?? refuse('fundraising.fund.none', 'Giving is not set up here yet.', { status: 409 })).id
  const fund = await getFund(fundId)
  if (!fund || fund.state !== 'active' || !(fund.offered || fund.isDefault)) refuse('fundraising.give.fund-closed', 'That fund is not taking gifts.', { status: 409, fields: { fundId: 'fundraising.give.fund-closed' } })
  return fund!.id
}

/** D5: a signed-in donor is the subject; a guest gives an email for the thanks. */
function donorOf(actor: Actor, input: GiveFields): { accountId: string | null, email: string | null } {
  if (actor.accountId) return { accountId: actor.accountId, email: null }
  if (!input.email) refuse('fundraising.give.email-needed', 'Give your email address so we can thank you.', { status: 422, fields: { email: 'fundraising.give.email-needed' } })
  return { accountId: null, email: input.email!.toLowerCase() }
}

/** A pending gift with its own payment, and the link to its thanks page. */
export async function startGift(unit: UnitView, actor: Actor, input: GiveFields): Promise<{ token: string, amountMinor: number, currency: string }> {
  await checkAmount(input.amountMinor)
  const fundId = await fundFor(input.fundId)
  const donor = donorOf(actor, input)
  const currency = await useSetting('core.locale.currency') as string
  const id = newId('gdn')
  const { token, hash } = await linkTokens.issue()
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO fundraising_donations (id, account_id, contact_email, donor_name, amount_minor, currency, fund_id, channel, state, acknowledge_as, message, link_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'online', 'pending', ?, ?, ?, ?, ?)`,
    params: [id, donor.accountId, donor.email, input.name || null, input.amountMinor, currency, fundId, input.acknowledgeAs || null, input.message || null, hash, at, at],
  })
  const expiresAt = at + (await useSetting('fundraising.giving.pay-within') as number) * 1000 // not-policy: seconds to milliseconds
  const { intentId, partIds } = await collect(unit, { parts: [{ owner: { module: 'fundraising', record: id }, amountMinor: input.amountMinor }], currency, expiresAt })
  unit.add({ sql: 'UPDATE fundraising_donations SET intent_id = ?, part_id = ? WHERE id = ?', params: [intentId, partIds[0], id] }).expect(1)
  unit.audit({ action: 'create', record: ['fundraising.donation', id], detail: { channel: 'online', amountMinor: input.amountMinor } })
  return { token, amountMinor: input.amountMinor, currency }
}

interface Linked { id: string, state: string, intentId: string | null }

async function linked(token: string): Promise<Linked> {
  const row = await first<Linked>('SELECT id, state, intent_id AS intentId FROM fundraising_donations WHERE link_hash = ?', await linkTokens.hash(token))
  return row ?? refuse('fundraising.give.not-found', 'This link does not open a gift.', { status: 404 })
}

/** Starts the gift's payment with the first online method, while it is still waiting for it. */
export async function payGift(token: string, origin: string): Promise<StartResult> {
  const gift = await linked(token)
  if (gift.state !== 'pending' || !gift.intentId || (await intentStatus(gift.intentId))?.state !== 'open')
    refuse('fundraising.give.not-waiting', 'This gift is no longer waiting for a payment.', { status: 409, remedy: 'Start again from the Give page.' })
  const offers = await methodsFor('online')
  if (!offers.length) refuse('fundraising.give.no-method', 'Online payment is not set up here.', { status: 409, remedy: 'Contact the theatre to give.' })
  return startAttempt(gift.intentId!, { method: offers[0]!.method, providerAccountId: offers[0]!.providerAccountId, origin })
}

/** Back from paying: asks the provider now rather than waiting for its webhook. */
export async function checkGift(token: string): Promise<void> {
  const gift = await linked(token)
  if (gift.state === 'pending' && gift.intentId) await refreshIntent(gift.intentId)
}

export interface Thanks { state: 'pending' | 'received' | 'abandoned' | 'refunded', reference: string | null, amountMinor: number, currency: string, fund: string, receivedOn: string | null }

/** P4: what the thanks page shows; nothing about the donor beyond what they gave. */
export async function thanksFor(token: string): Promise<Thanks> {
  const gift = await linked(token)
  return (await first<Thanks>(
    `SELECT d.state, d.reference, d.amount_minor AS amountMinor, d.currency, f.name AS fund, d.received_on AS receivedOn
       FROM fundraising_donations d JOIN fundraising_funds f ON f.id = d.fund_id WHERE d.id = ?`, gift.id))!
}
