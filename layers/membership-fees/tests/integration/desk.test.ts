// Taking a fee at the desk (rule P8): a seller finds somebody whose membership waits only for its fee,
// adds it to the till, and the money taken there activates the membership and posts the income in
// Payments' batch, as paying online does. A payment that ends without the money leaves the fee open;
// a fee already being paid online, a changed amount and a theatre that takes no fees at the desk are
// refused.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId } from '#kit'
import { attest, cancelIntent, openSession } from '../../../payments/server/services'
import { call, env, inContext, person, rows } from '../../../../tests/integration/helpers'
import { applicant, req } from '../../../membership/tests/integration/stage'
import { charge, fees, handle, income, membership, paid, pay, providers, ready } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'membership-fees.payment.take'])
const onlooker = person(['payments.session.open'])

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function till(input: Record<string, unknown>, actor = seller) {
  const response = await call(handle, 'POST', '/api/payments/till/sale', { actor, body: { panels: [{ basket: 'membership-fees', input }] }, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const payCash = (intentId: string) => inContext(() => attest({ intentId, providerAccountId: providers.cash, method: 'cash' }), seller)
const chargeId = async (membershipId: string) => (await rows<{ id: string }>("SELECT id FROM membership_fees_charges WHERE membership_id = ? AND state <> 'void'", membershipId))[0]!.id

/** An application to a paid scheme, waiting for its fee. */
async function applied(name: string) {
  const id = await paid()
  const who = await applicant(name)
  const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
  return { schemeId: id, who, membershipId: m, chargeId: await chargeId(m) }
}

beforeAll(async () => {
  await ready()
  // Payments takes no cash until a theatre turns it on.
  await env.DB.prepare("UPDATE payments_provider_accounts SET active = ? WHERE provider = 'cash'").bind(1).run()
  for (const who of [seller, onlooker]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

describe('finding a fee to take', () => {
  it('finds applications waiting for their fee by name, but not one still being checked', async () => {
    const a = await applied('Desk Findable')
    const found = await fees('GET', '/api/membership-fees/desk/waiting?q=Findable', undefined, seller)
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.fees).toEqual([expect.objectContaining({ chargeId: a.chargeId, membershipId: a.membershipId, accountName: 'Desk Findable', amountMinor: 1000, lengthName: '12 months', beingPaid: false })])

    const checked = await paid()
    expect((await req('PATCH', `/api/membership/schemes/${checked}`, { verifier: 'membership.staff' })).status).toBe(200)
    await req('POST', `/api/membership/schemes/${checked}/join`, {}, await applicant('Desk Unchecked'))
    expect((await fees('GET', '/api/membership-fees/desk/waiting?q=Unchecked', undefined, seller)).body.fees).toEqual([])
    expect((await fees('GET', '/api/membership-fees/desk/waiting?q=Findable', undefined, onlooker)).status).toBe(403)
  })
})

describe('taking a fee in the till', () => {
  it('activates the membership when the cash is taken, and posts the fee as income', async () => {
    const a = await applied('Pays At Desk')
    expect((await till({ chargeId: a.chargeId, expectedAmountMinor: 900 })).body.code).toBe('membership-fees.desk.amount-changed')
    expect((await till({ chargeId: a.chargeId, expectedAmountMinor: 1000 }, onlooker)).status).toBe(403)

    const before = await income()
    const sale = await till({ chargeId: a.chargeId, expectedAmountMinor: 1000 })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(await rows('SELECT intent_id, channel FROM membership_fees_charges WHERE id = ?', a.chargeId)).toEqual([{ intent_id: sale.body.intentId, channel: 'desk' }])
    expect((await fees('GET', '/api/membership-fees/desk/waiting?q=Pays%20At%20Desk', undefined, seller)).body.fees).toEqual([expect.objectContaining({ beingPaid: true })])
    expect((await till({ chargeId: a.chargeId, expectedAmountMinor: 1000 })).body.code).toBe('membership-fees.desk.being-paid')

    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true, unfulfilled: false })
    expect(await membership(a.membershipId)).toMatchObject({ state: 'active', starts_on: '2026-11-17', ends_on: '2027-11-16' })
    expect(await rows('SELECT state, channel FROM membership_fees_charges WHERE id = ?', a.chargeId)).toEqual([{ state: 'paid', channel: 'desk' }])
    expect(await income()).toBe(before - 1000)
    expect((await till({ chargeId: a.chargeId, expectedAmountMinor: 1000 })).body.code).toBe('membership-fees.desk.not-waiting')
  })

  it('leaves the fee open when the payment is cancelled, to be paid online instead', async () => {
    const a = await applied('Changes To Card')
    const sale = await till({ chargeId: a.chargeId, expectedAmountMinor: 1000 })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    await commit(unit => cancelIntent(unit.view(), sale.body.intentId))
    expect(await rows('SELECT state, intent_id, channel FROM membership_fees_charges WHERE id = ?', a.chargeId)).toEqual([{ state: 'open', intent_id: null, channel: null }])
    expect((await pay(a.membershipId, a.who)).answer).toMatchObject({ settled: true })
    expect(await rows('SELECT state, channel FROM membership_fees_charges WHERE id = ?', a.chargeId)).toEqual([{ state: 'paid', channel: 'online' }])
  })

  it('refuses a fee already being paid online, and every fee while the desk is off', async () => {
    const a = await applied('Paying Online Now')
    expect((await fees('POST', `/api/membership-fees/mine/${a.membershipId}/checkout`, {}, a.who)).status).toBe(200)
    expect((await till({ chargeId: a.chargeId, expectedAmountMinor: 1000 })).body.code).toBe('membership-fees.desk.being-paid')

    const b = await applied('Desk Switched Off')
    await commit(unit => changeSetting(unit.view(), 'membership-fees.desk.enabled', false, { reason: 'test', confirm: true }))
    expect((await till({ chargeId: b.chargeId, expectedAmountMinor: 1000 })).body.code).toBe('membership-fees.desk.off')
    await commit(unit => changeSetting(unit.view(), 'membership-fees.desk.enabled', true, { reason: 'test', confirm: true }))
    expect((await charge(b.membershipId))!.state).toBe('open')
  })
})
