// Membership fees (rules S5, P1 to P6, A1, A2, J5): a scheme that requires payment cannot be joined
// online without the fees module and a price; joining charges the price in force; paying online
// activates the membership and posts the income in Payments' batch; a staff check comes before
// paying; an application not paid in time expires and its payment is cancelled; and a payment that
// lands after the application has gone settles nothing.
import { env } from 'cloudflare:test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { NOV_17, applicant, ready as membershipReady, req, scheme } from '../../../membership/tests/integration/stage'
import expireApplications from '../../../membership/server/tasks/expire-applications'
import schemesGet from '../../server/api/membership-fees/schemes/index.get'
import pricesPost from '../../server/api/membership-fees/schemes/[id]/prices.post'
import mineGet from '../../server/api/membership-fees/mine/[id].get'
import checkoutPost from '../../server/api/membership-fees/mine/[id]/checkout.post'
import payPost from '../../server/api/membership-fees/mine/[id]/pay.post'
import checkPost from '../../server/api/membership-fees/mine/[id]/check.post'

const handle = server({
  'GET /api/membership-fees/schemes': schemesGet,
  'POST /api/membership-fees/schemes/:id/prices': pricesPost,
  'GET /api/membership-fees/mine/:id': mineGet,
  'POST /api/membership-fees/mine/:id/checkout': checkoutPost,
  'POST /api/membership-fees/mine/:id/pay': payPost,
  'POST /api/membership-fees/mine/:id/check': checkPost,
})
const treasurer = person(['membership-fees.price.manage'], { reassertedAt: NOV_17 })
async function fees<T = any>(method: string, path: string, body: unknown, actor: ReturnType<typeof person>): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'POST' ? { 'idempotency-key': newId('req') } : {} })
  return { status: response.status, body: await response.json() as T }
}

let card = ''
beforeAll(async () => {
  await membershipReady()
  for (const id of ['finance', 'payments', 'membership-fees', 'cardco']) await setModule(id, true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_17, NOV_17).run()
})
afterAll(() => setClock(NOV_17))

/** An open scheme that requires payment, with its lengths (12 months, and 36 if asked) and a join price for every length. */
async function paid(fields: Record<string, unknown> = {}, lengths = [12], amountMinor = 1000) {
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
async function pay(membershipId: string, who: ReturnType<typeof person>, state: 'succeeded' | 'failed' = 'succeeded') {
  const opened = await fees('POST', `/api/membership-fees/mine/${membershipId}/checkout`, {}, who)
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  const started = await fees('POST', `/api/membership-fees/mine/${membershipId}/pay`, {}, who)
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  expect(started.body.next).toMatchObject({ kind: 'redirect' })
  const answer = await inContext(() => recordAnswer(started.body.attemptId, state === 'succeeded' ? { state, providerRef: `cc_${started.body.attemptId}` } : { state, failureCode: 'declined' }, { kind: 'poll' }))
  return { intentId: opened.body.intentId as string, attemptId: started.body.attemptId as string, answer }
}

const membership = async (id: string) => (await rows<{ state: string, starts_on: string | null, ends_on: string | null, paid_at: number | null, expires_at: number | null }>('SELECT state, starts_on, ends_on, paid_at, expires_at FROM membership_memberships WHERE id = ?', id))[0]!
const charge = async (membershipId: string) => (await rows<{ state: string, amount_minor: number, intent_id: string | null }>('SELECT state, amount_minor, intent_id FROM membership_fees_charges WHERE membership_id = ? ORDER BY created_at DESC LIMIT 1', membershipId))[0]
const income = async () => (await rows<{ total: number | null }>("SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'membership-fees.income'"))[0]!.total ?? 0

describe('without the fees module or a price', () => {
  it('refuses to open the scheme, and refuses joining one that requires payment', async () => {
    const id = await paid()
    await setModule('membership-fees', false)
    const who = await applicant('No Fees Module')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.code).toBe('membership.join.not-online')
    await setModule('membership-fees', true)
  })
})

describe('setting prices', () => {
  it('lists schemes with the price in force, refuses a past date, and lets a price for one length win', async () => {
    const id = await paid({}, [12, 36], 1000)
    const options = await rows<{ id: string, count: number }>('SELECT id, count FROM membership_length_options WHERE scheme_id = ? ORDER BY count', id)
    const three = options.find(o => o.count === 36)!.id
    expect((await fees('POST', `/api/membership-fees/schemes/${id}/prices`, { lengthOptionId: three, appliesTo: 'join', amountMinor: 2500, fromDate: '2026-11-16' }, treasurer)).body.code).toBe('membership-fees.price.past')
    expect((await fees('POST', `/api/membership-fees/schemes/${id}/prices`, { lengthOptionId: three, appliesTo: 'join', amountMinor: 2500, fromDate: '2026-11-17' }, treasurer)).status).toBe(200)
    expect((await fees('POST', `/api/membership-fees/schemes/${id}/prices`, { lengthOptionId: three, appliesTo: 'join', amountMinor: 2600, fromDate: '2026-11-17' }, treasurer)).body.code).toBe('membership-fees.price.same-day')
    expect((await fees('POST', `/api/membership-fees/schemes/${id}/prices`, { lengthOptionId: null, appliesTo: 'join', amountMinor: 900, fromDate: '2026-11-17' }, person([]))).status).toBe(403)
    const listed = (await fees('GET', '/api/membership-fees/schemes', undefined, treasurer)).body.schemes.find((s: { id: string }) => s.id === id)
    expect(listed.lengths).toEqual([
      { id: options[0]!.id, name: '12 months', join: 1000, renew: 1000 },
      { id: three, name: '36 months', join: 2500, renew: 1000 },
    ])
    expect(listed.history).toHaveLength(2)

    const who = await applicant('Three Years')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { lengthOptionId: three }, who)
    expect(joined.body, JSON.stringify(joined.body)).toMatchObject({ pending: true, waiting: 'payment', amountMinor: 2500, currency: 'GBP' })
  })
})

describe('paying online', () => {
  it('charges on joining, activates on payment and posts the fee as income, in one batch', async () => {
    const id = await paid()
    const who = await applicant('Paying Member')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, {}, who)
    expect(joined.body).toMatchObject({ pending: true, waiting: 'payment', amountMinor: 1000 })
    const m = joined.body.membershipId as string
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body).toMatchObject({ membershipId: m, waiting: 'payment' })
    expect(await membership(m)).toMatchObject({ state: 'pending', paid_at: null, expires_at: NOV_17 + 14 * 86_400_000 })
    expect(await charge(m)).toMatchObject({ state: 'open', amount_minor: 1000, intent_id: null })
    expect((await req('GET', '/api/membership/mine', undefined, who)).body.applications).toEqual([expect.objectContaining({ id: m, waiting: 'payment', charge: { state: 'open', amountMinor: 1000, currency: 'GBP' } })])
    expect((await fees('GET', `/api/membership-fees/mine/${m}`, undefined, who)).body).toMatchObject({ state: 'to-pay', amountMinor: 1000, online: true })
    expect((await fees('GET', `/api/membership-fees/mine/${m}`, undefined, await applicant('Somebody Else'))).status).toBe(404)

    const before = await income()
    const { intentId, answer } = await pay(m, who)
    expect(answer).toMatchObject({ changed: true, settled: true, unfulfilled: false })
    expect(await membership(m)).toMatchObject({ state: 'active', starts_on: '2026-11-17', ends_on: '2027-11-16', expires_at: null })
    expect((await membership(m)).paid_at).not.toBeNull()
    expect(await charge(m)).toMatchObject({ state: 'paid', intent_id: intentId })
    expect(await income()).toBe(before - 1000)
    expect((await rows('SELECT for_module FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = \'membership-fees.income\' AND e.posting_id = (SELECT posting_id FROM finance_entries ORDER BY id DESC LIMIT 1)'))).toEqual([{ for_module: 'membership-fees' }])
    expect((await fees('GET', `/api/membership-fees/mine/${m}`, undefined, who)).body.state).toBe('paid')
    expect((await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)).body.code).toBe('membership-fees.pay.not-waiting')
  })

  it('reuses the open payment on a second press, and opens a fresh one after a declined card', async () => {
    const id = await paid()
    const who = await applicant('Declined Card')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    const first = await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)
    expect((await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)).body).toMatchObject({ intentId: first.body.intentId, fresh: false })
    const declined = await inContext(async () => {
      const unit = createUnit()
      const attempt = addAttempt(unit.view(), { intentId: first.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: 1000 })
      await unit.commit()
      return recordAnswer(attempt.id, { state: 'failed', failureCode: 'declined' }, { kind: 'poll' })
    })
    expect(declined).toMatchObject({ settled: false })
    expect((await membership(m)).state).toBe('pending')
    const { answer } = await pay(m, who)
    expect(answer).toMatchObject({ settled: true })
    expect((await membership(m)).state).toBe('active')
  })
})

describe('a staff check before paying', () => {
  it('is charged on applying, asks for payment only once passed, and activates when paid', async () => {
    const id = await paid()
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.staff' })).status).toBe(200)
    const who = await applicant('Checked Then Paid')
    const applied = await req('POST', `/api/membership/schemes/${id}/join`, {}, who)
    expect(applied.body).toMatchObject({ pending: true, waiting: 'staff-check' })
    const m = applied.body.membershipId as string
    expect(await charge(m)).toMatchObject({ state: 'open', amount_minor: 1000 })
    expect((await membership(m)).expires_at).toBeNull()
    expect((await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)).body.code).toBe('membership-fees.pay.not-yet')
    expect((await fees('GET', `/api/membership-fees/mine/${m}`, undefined, who)).body.state).toBe('checking')

    const passed = await req('POST', `/api/membership/applications/${m}/decide`, { outcome: 'pass' }, person(['membership.membership.verify'], { reassertedAt: NOV_17 }))
    expect(passed.body, JSON.stringify(passed.body)).toEqual({ state: 'pending', waiting: 'payment' })
    expect((await membership(m)).expires_at).toBe(NOV_17 + 14 * 86_400_000)
    expect((await pay(m, who)).answer).toMatchObject({ settled: true })
    expect(await membership(m)).toMatchObject({ state: 'active', starts_on: '2026-11-17', ends_on: '2027-11-16' })
  })
})

describe('an application that goes before it is paid', () => {
  it('expires when not paid in time, cancelling its payment and voiding its charge', async () => {
    const id = await paid()
    const who = await applicant('Too Slow')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    const opened = await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)
    setClock(NOV_17 + 15 * 86_400_000)
    await inContext(async () => {
      const unit = createUnit()
      await expireApplications(unit.view(), { dueAt: Date.now() })
      await unit.commit()
    }, { kind: 'job' } as never)
    setClock(NOV_17)
    expect((await membership(m)).state).toBe('expired')
    expect(await charge(m)).toMatchObject({ state: 'void', intent_id: null })
    expect(await rows('SELECT state FROM payments_intents WHERE id = ?', opened.body.intentId)).toEqual([{ state: 'cancelled' }])
  })

  it('settles nothing when the money arrives after the application was withdrawn', async () => {
    const id = await paid()
    const who = await applicant('Changed Mind')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    const opened = await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)
    const started = await fees('POST', `/api/membership-fees/mine/${m}/pay`, {}, who)
    expect((await req('POST', `/api/membership/mine/${m}/withdraw`, {}, who)).status).toBe(200)
    expect((await membership(m)).state).toBe('ended')
    const late = await inContext(() => recordAnswer(started.body.attemptId, { state: 'succeeded', providerRef: `cc_${started.body.attemptId}` }, { kind: 'poll' }))
    expect(late).toMatchObject({ settled: false })
    expect((await membership(m)).state).toBe('ended')
    expect((await charge(m))?.state ?? 'void').toBe('void')
    expect((await rows<{ state: string }>('SELECT state FROM payments_intents WHERE id = ?', opened.body.intentId))[0]!.state).not.toBe('succeeded')
  })
})

describe('renewing a paid membership', () => {
  it('charges the renewal price and starts the day after the old one ends, once paid', async () => {
    const id = await paid()
    expect((await fees('POST', `/api/membership-fees/schemes/${id}/prices`, { lengthOptionId: null, appliesTo: 'renew', amountMinor: 800, fromDate: '2026-11-17' }, treasurer)).status).toBe(200)
    const who = await applicant('Renews Paid')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    await pay(m, who)
    setClock(Date.parse('2027-10-20T12:00:00Z'))
    const renewed = await req('POST', `/api/membership/mine/${m}/renew`, {}, who)
    expect(renewed.body, JSON.stringify(renewed.body)).toMatchObject({ pending: true, renewed: true, waiting: 'payment', amountMinor: 800 })
    await pay(renewed.body.membershipId, who)
    expect(await membership(renewed.body.membershipId)).toMatchObject({ state: 'active', starts_on: '2027-11-17', ends_on: '2028-11-16' })
    setClock(NOV_17)
  })
})
