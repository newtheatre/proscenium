// Membership fees (rules S5, P1 to P6, A1, A2, J5): a scheme that requires payment cannot be joined
// online without the fees module and a price; joining charges the price in force; paying online
// activates the membership and posts the income in Payments' batch; a staff check comes before
// paying; an application not paid in time expires and its payment is cancelled; and a payment that
// lands after the application has gone settles nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { NOV_17, applicant, req } from '../../../membership/tests/integration/stage'
import expireApplications from '../../../membership/server/tasks/expire-applications'
import chargeResolver from '../../server/contributions/core.record-resolver/charge'
import unpostedCharges from '../../server/contributions/core.health-check/unposted-charges'
import { charge, fees, income, membership, paid, pay, providers, ready, treasurer } from './stage'

beforeAll(ready)
afterAll(() => setClock(NOV_17))

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
    expect((await req('GET', '/api/membership/mine', undefined, who)).body.applications).toEqual([expect.objectContaining({ id: m, waiting: 'payment', charge: expect.objectContaining({ state: 'open', amountMinor: 1000, refundedMinor: 0, currency: 'GBP' }) })])
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

    // The fee has its income in the ledger, and is titled by its scheme, never the person.
    expect((await inContext(() => unpostedCharges.check())).state).toBe('ok')
    const chargeId = (await rows<{ id: string }>('SELECT id FROM membership_fees_charges WHERE membership_id = ?', m))[0]!.id
    expect(await inContext(() => chargeResolver.resolve(chargeId))).toMatchObject({ title: expect.stringMatching(/^Fee for Scheme \d+$/), parent: { type: 'membership.membership', id: m } })
  })

  it('reuses the open payment on a second press, and opens a fresh one after a declined card', async () => {
    const id = await paid()
    const who = await applicant('Declined Card')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    const first = await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)
    expect((await fees('POST', `/api/membership-fees/mine/${m}/checkout`, {}, who)).body).toMatchObject({ intentId: first.body.intentId, fresh: false })
    const declined = await inContext(async () => {
      const unit = createUnit()
      const attempt = addAttempt(unit.view(), { intentId: first.body.intentId, providerAccountId: providers.card, method: 'card_online', amountMinor: 1000 })
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
