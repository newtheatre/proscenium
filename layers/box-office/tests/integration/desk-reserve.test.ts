// Reserving for somebody at the desk or by phone (BO-34, cut to the reservation path): the booking is
// reserved for the person named, emailed to them, released unpaid before the start like one made
// online, and paid for at the till later; what a pass still owes rides on it as it does online.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { resetRateLimits } from '#kit/ratelimit'
import { openSession } from '../../../payments/server/services'
import { issuePass } from '../../server/pass-holding'
import { listPassTypes } from '../../server/passes'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.pass.manage'])
const onlooker = person(['box-office.order.view'])
let h: House
let names = 0

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const told = (typeKey: string, orderId: string) => rows<{ id: string }>('SELECT id FROM core_notifications WHERE type_key IN (?, ? || \'-guest\') AND subject_id = ?', typeKey, typeKey, orderId)
const reserve = (body: Record<string, unknown>, actor = seller) => req('POST', '/api/box-office/desk/reserve', body, actor)
const tickets = (n: number) => ({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: n }] })
const priceOf = async () => (await req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input: tickets(1) }] }, seller)).body.amountMinor as number

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  h = await house(30)
  await inContext(() => ensureManagedTicketTypes())
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
  await commit(unit => changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true }))
})

describe('a reservation made by staff', () => {
  it('is reserved for the address typed, taken by phone, and emailed to them', async () => {
    const each = await priceOf()
    const done = await reserve({ sale: tickets(2), expectedTotalMinor: each * 2, email: 'phoned@example.org' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'reserved', amountDueMinor: each * 2 })
    const o = await order(done.body.orderId)
    expect(o).toMatchObject({ state: 'reserved', channel: 'phone', sold_by: seller.accountId, total_minor: each * 2 })
    expect(o.release_at).not.toBeNull()
    expect(await rows('SELECT state FROM box_office_claims c JOIN box_office_holds k ON k.id = c.hold_id WHERE k.order_id = ? AND k.kind = \'reservation\'', o.id)).toEqual([{ state: 'confirmed' }, { state: 'confirmed' }])
    const account = await commit(async unit => (await findOrCreateAccount(unit.view(), { address: 'phoned@example.org', origin: 'guest' })).accountId)
    expect(o.account_id).toBe(account)
    expect(await told('box-office.order-reserved', o.id)).toHaveLength(1)
    // It is then found at the desk and paid for like any other reservation.
    const found = await req('GET', `/api/box-office/desk/orders?q=${done.body.reference}`, undefined, seller)
    expect(found.body.orders[0]).toMatchObject({ orderId: o.id, state: 'reserved', amountDueMinor: each * 2 })
  })

  it('refuses a total other than the one shown, quoting both', async () => {
    const each = await priceOf()
    const refused = await reserve({ sale: tickets(1), expectedTotalMinor: each + 100, email: 'wrong-total@example.org' })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('box-office.order.total-changed')
  })

  it('asks who it is for, and is refused to somebody who may not sell', async () => {
    const each = await priceOf()
    expect((await reserve({ sale: tickets(1), expectedTotalMinor: each })).body.code).toBe('box-office.desk.reserve-for')
    expect((await reserve({ sale: tickets(1), expectedTotalMinor: each, email: 'nope@example.org' }, onlooker)).status).toBe(403)
  })

  it('keeps the per-person limit a buyer\'s own reservation keeps', async () => {
    const each = await priceOf()
    await commit(unit => changeSetting(unit.view(), 'box-office.reservations.max-tickets-per-person', 2, { reason: 'test', confirm: true }))
    expect((await reserve({ sale: tickets(2), expectedTotalMinor: each * 2, email: 'limit@example.org' })).status).toBe(200)
    expect((await reserve({ sale: tickets(1), expectedTotalMinor: each, email: 'limit@example.org' })).body.code).toBe('box-office.reservation.person-limit')
    await commit(unit => changeSetting(unit.view(), 'box-office.reservations.max-tickets-per-person', 8, { reason: 'test', confirm: true }))
  })
})

describe('a reservation on an unpaid pass', () => {
  it('goes to the pass holder with nobody named, and carries what the pass owes, once', async () => {
    const made = await req('POST', '/api/box-office/pass-types', { name: `Phone pass ${++names}`, covers: 'productions', productionIds: [h.productionId], perShow: 'any', reserveUnpaid: true, prices: [{ name: 'Member', amountMinor: 2100 }], onSale: true }, seller)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const type = (await inContext(() => listPassTypes())).find(t => t.id === made.body.id)!
    const holder = await commit(async unit => (await findOrCreateAccount(unit.view(), { address: 'pass.phone@example.org', name: 'Rhian Evans', origin: 'guest' })).accountId)
    const pass = await commit(unit => issuePass(unit.view(), { passTypeId: type.id, passPriceId: type.prices[0]!.id, accountId: holder, paid: false, issuedBy: null }))
    const second = await house(30, { of: h })

    const first = await reserve({ sale: { performanceId: h.performanceId, lines: [], passes: [{ code: pass.code }] }, expectedTotalMinor: 2100 })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(await order(first.body.orderId)).toMatchObject({ state: 'reserved', account_id: holder, total_minor: 2100 })
    expect(await told('box-office.order-reserved', first.body.orderId)).toHaveLength(1)

    // The next booking on the pass owes nothing more: the first carries the pass's money.
    const found = await req('GET', `/api/box-office/desk/pass?performanceId=${second.performanceId}&code=${pass.code}`, undefined, seller)
    expect(found.body).toMatchObject({ owedMinor: 0, unusable: null })
    const next = await reserve({ sale: { performanceId: second.performanceId, lines: [], passes: [{ code: pass.code }] }, expectedTotalMinor: 0 })
    expect(next.status, JSON.stringify(next.body)).toBe(200)
    expect(next.body.state).toBe('confirmed')
    expect((await rows<{ paid_at: number | null }>('SELECT paid_at FROM box_office_passes WHERE id = ?', pass.id))[0]!.paid_at).toBeNull()
  })
})
