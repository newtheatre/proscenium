// Fees from the staff side (rules P7, P9): adding a member to a paid scheme sends them a link to pay
// or waives the fee with a reason; waiving an applicant's fee activates their membership; a membership
// page shows its fee to those who may see it; and a refund reverses the income and, in full, ends the
// membership.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { deliver, inContext, person, rows } from '../../../../tests/integration/helpers'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { NOV_17, applicant, req } from '../../../membership/tests/integration/stage'
import { charge, fees, income, membership, paid, pay, ready } from './stage'

const officer = person(['membership.membership.add', 'membership.membership.view'], { reassertedAt: NOV_17 })
const waiver = person(['membership.membership.add', 'membership-fees.charge.waive'], { reassertedAt: NOV_17 })
const refunder = person(['membership-fees.refund.request'], { reassertedAt: NOV_17 })

beforeAll(async () => {
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await changeSetting(unit.view(), 'payments.refunds.self-approve-up-to', 5000, { reason: 'test', confirm: true })
    await unit.commit()
  })
  world.refundAnswer = { state: 'succeeded', providerRef: 're_membership' }
})
afterAll(() => setClock(NOV_17))

describe('adding a member to a paid scheme', () => {
  it('asks how the fee is settled, and sends a link to pay that starts the membership once paid', async () => {
    const id = await paid()
    const add = (body: Record<string, unknown>, actor = officer) => req('POST', `/api/membership/schemes/${id}/members`, body, actor)
    expect((await add({ address: 'nochoice@example.org' })).body.code).toBe('membership.add.fee-choice')
    expect((await add({ address: 'nowaive@example.org', fee: 'waive', note: 'Life member' })).body.code).toBe('membership.add.cannot-waive')
    expect((await add({ address: 'dated@example.org', fee: 'link', startsOn: '2026-12-01' })).body.code).toBe('membership.add.dates-with-link')

    const linked = await add({ address: 'linked@example.org', name: 'Linked Member', fee: 'link' })
    expect(linked.body, JSON.stringify(linked.body)).toMatchObject({ pending: true, waiting: 'payment', amountMinor: 1000 })
    const m = linked.body.membershipId as string
    expect(await membership(m)).toMatchObject({ state: 'pending' })
    const [sent] = await rows<{ payload: string }>("SELECT payload FROM core_notifications WHERE type_key = 'membership.pay-link' AND subject_id = ?", m)
    expect(JSON.parse(sent!.payload)).toMatchObject({ scheme: expect.any(String), amount: '£10.00', link: `https://theatre.example/account/membership/${m}/pay` })

    const who = { ...person([], { name: 'Linked Member' }), accountId: linked.body.accountId as string }
    expect((await pay(m, who)).answer).toMatchObject({ settled: true })
    expect(await membership(m)).toMatchObject({ state: 'active', starts_on: '2026-11-17', ends_on: '2027-11-16' })
  })

  it('waives the fee with a reason, and the membership starts at once', async () => {
    const id = await paid()
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { address: 'free@example.org', fee: 'waive' }, waiver)).body.code).toBe('membership.add.waive-reason')
    const added = await req('POST', `/api/membership/schemes/${id}/members`, { address: 'free@example.org', fee: 'waive', note: 'Honorary member' }, waiver)
    expect(added.body, JSON.stringify(added.body)).toMatchObject({ startsOn: '2026-11-17', endsOn: '2027-11-16' })
    expect(await membership(added.body.membershipId)).toMatchObject({ state: 'active' })
    expect(await charge(added.body.membershipId)).toBeUndefined()
  })
})

describe('waiving an applicant\'s fee', () => {
  it('activates the membership, voids the charge and keeps the reason for staff', async () => {
    const id = await paid()
    const who = await applicant('Waived Applicant')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    const shown = await fees('GET', `/api/membership-fees/memberships/${m}/charge`, undefined, person(['membership-fees.charge.waive'], { reassertedAt: NOV_17 }))
    expect(shown.body).toMatchObject({ charge: { state: 'open', amountMinor: 1000 }, canWaive: true, canRefund: false })
    expect((await fees('GET', `/api/membership-fees/memberships/${m}/charge`, undefined, person([]))).status).toBe(403)
    const chargeId = shown.body.charge.id as string
    expect((await fees('POST', `/api/membership-fees/charges/${chargeId}/waive`, { note: 'Hardship' }, person(['membership-fees.charge.view']))).status).toBe(403)
    const waived = await fees('POST', `/api/membership-fees/charges/${chargeId}/waive`, { note: 'Hardship' }, person(['membership-fees.charge.waive'], { reassertedAt: NOV_17 }))
    expect(waived.body, JSON.stringify(waived.body)).toEqual({ membershipState: 'active' })
    expect(await membership(m)).toMatchObject({ state: 'active', starts_on: '2026-11-17' })
    expect(await rows('SELECT note FROM membership_memberships WHERE id = ?', m)).toEqual([{ note: 'Hardship' }])
    expect(await charge(m)).toMatchObject({ state: 'void' })
  })
})

describe('refunding a fee', () => {
  it('reverses the income, and a full refund ends the membership', async () => {
    const id = await paid()
    const who = await applicant('Wants Money Back')
    const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body.membershipId as string
    await pay(m, who)
    const before = await income()
    const chargeId = (await rows<{ id: string }>('SELECT id FROM membership_fees_charges WHERE membership_id = ?', m))[0]!.id
    expect((await fees('POST', `/api/membership-fees/charges/${chargeId}/refund`, { amountMinor: 1001 }, refunder)).body.code).toBe('membership-fees.refund.too-much')

    const part = await fees('POST', `/api/membership-fees/charges/${chargeId}/refund`, { amountMinor: 400 }, refunder)
    expect(part.body, JSON.stringify(part.body)).toMatchObject({ state: 'approved' })
    await deliver()
    expect(await rows('SELECT state, refunded_minor FROM membership_fees_charges WHERE id = ?', chargeId)).toEqual([{ state: 'part-refunded', refunded_minor: 400 }])
    expect(await income()).toBe(before + 400)
    expect((await membership(m)).state).toBe('active')

    expect((await fees('POST', `/api/membership-fees/charges/${chargeId}/refund`, { amountMinor: 600 }, refunder)).status).toBe(200)
    await deliver()
    expect(await rows('SELECT state, refunded_minor FROM membership_fees_charges WHERE id = ?', chargeId)).toEqual([{ state: 'refunded', refunded_minor: 1000 }])
    expect(await income()).toBe(before + 1000)
    expect(await rows('SELECT state, end_reason FROM membership_memberships WHERE id = ?', m)).toEqual([{ state: 'ended', end_reason: 'refunded' }])
  })
})
