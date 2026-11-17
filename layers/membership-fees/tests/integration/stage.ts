// Shared set-up for the membership fees tests: membership's stage with Finance, Payments, the fees
// module and the pretend card provider on, the fees routes mounted, and helpers that make a paid
// scheme, pay an application and read what it left behind.
import { env } from 'cloudflare:test'
import { expect } from 'vitest'
import { newId } from '#kit'
import { recordAnswer } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { NOV_17, ready as membershipReady, req, scheme } from '../../../membership/tests/integration/stage'
import schemesGet from '../../server/api/membership-fees/schemes/index.get'
import pricesPost from '../../server/api/membership-fees/schemes/[id]/prices.post'
import mineGet from '../../server/api/membership-fees/mine/[id].get'
import checkoutPost from '../../server/api/membership-fees/mine/[id]/checkout.post'
import payPost from '../../server/api/membership-fees/mine/[id]/pay.post'
import checkPost from '../../server/api/membership-fees/mine/[id]/check.post'
import chargeGet from '../../server/api/membership-fees/memberships/[id]/charge.get'
import waivePost from '../../server/api/membership-fees/charges/[id]/waive.post'
import refundPost from '../../server/api/membership-fees/charges/[id]/refund.post'
import waitingGet from '../../server/api/membership-fees/desk/waiting.get'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import tillSummaryPost from '../../../payments/server/api/payments/till/summary.post'

export const handle = server({
  'GET /api/membership-fees/schemes': schemesGet,
  'POST /api/membership-fees/schemes/:id/prices': pricesPost,
  'GET /api/membership-fees/mine/:id': mineGet,
  'POST /api/membership-fees/mine/:id/checkout': checkoutPost,
  'POST /api/membership-fees/mine/:id/pay': payPost,
  'POST /api/membership-fees/mine/:id/check': checkPost,
  'GET /api/membership-fees/memberships/:id/charge': chargeGet,
  'POST /api/membership-fees/charges/:id/waive': waivePost,
  'POST /api/membership-fees/charges/:id/refund': refundPost,
  'GET /api/membership-fees/desk/waiting': waitingGet,
  'POST /api/payments/till/sale': tillSalePost,
  'POST /api/payments/till/summary': tillSummaryPost,
})
export const treasurer = person(['membership-fees.price.manage'], { reassertedAt: NOV_17 })
export async function fees<T = any>(method: string, path: string, body: unknown, actor: ReturnType<typeof person>): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'POST' ? { 'idempotency-key': newId('req') } : {} })
  return { status: response.status, body: await response.json() as T }
}

export const providers = { card: '', cash: '' }
export async function ready(): Promise<void> {
  await membershipReady()
  for (const id of ['finance', 'payments', 'membership-fees', 'cardco']) await setModule(id, true)
  if (providers.card) return
  providers.card = newId('ppa')
  providers.cash = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(providers.card, NOV_17, NOV_17).run()
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(providers.cash, NOV_17, NOV_17).run()
}

/** An open scheme that requires payment, with its lengths (12 months, and 36 if asked) and a join price for every length. */
export async function paid(fields: Record<string, unknown> = {}, lengths = [12], amountMinor = 1000) {
  const id = await scheme({ requiresPayment: true, renewalOpensDays: 30, ...fields }, lengths)
  const notYet = await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  expect(notYet.status).toBe(409)
  const set = await fees('POST', `/api/membership-fees/schemes/${id}/prices`, { lengthOptionId: null, appliesTo: 'join-and-renew', amountMinor, fromDate: '2026-11-17' }, treasurer)
  expect(set.status, JSON.stringify(set.body)).toBe(200)
  const opened = await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  return id
}

/** Pays the application online: opens the payment, starts it with CardCo, and has CardCo answer. */
export async function pay(membershipId: string, who: ReturnType<typeof person>, state: 'succeeded' | 'failed' = 'succeeded') {
  const opened = await fees('POST', `/api/membership-fees/mine/${membershipId}/checkout`, {}, who)
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  const started = await fees('POST', `/api/membership-fees/mine/${membershipId}/pay`, {}, who)
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  expect(started.body.next).toMatchObject({ kind: 'redirect' })
  const answer = await inContext(() => recordAnswer(started.body.attemptId, state === 'succeeded' ? { state, providerRef: `cc_${started.body.attemptId}` } : { state, failureCode: 'declined' }, { kind: 'poll' }))
  return { intentId: opened.body.intentId as string, attemptId: started.body.attemptId as string, answer }
}

export const membership = async (id: string) => (await rows<{ state: string, starts_on: string | null, ends_on: string | null, paid_at: number | null, expires_at: number | null }>('SELECT state, starts_on, ends_on, paid_at, expires_at FROM membership_memberships WHERE id = ?', id))[0]!
export const charge = async (membershipId: string) => (await rows<{ state: string, amount_minor: number, intent_id: string | null }>('SELECT state, amount_minor, intent_id FROM membership_fees_charges WHERE membership_id = ? ORDER BY created_at DESC LIMIT 1', membershipId))[0]
export const income = async () => (await rows<{ total: number | null }>("SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'membership-fees.income'"))[0]!.total ?? 0
