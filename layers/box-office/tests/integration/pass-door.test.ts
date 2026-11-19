// A pass code shown in place of a booking's reference (Matt, 19 November): at the door it admits the
// entry it booked tonight, and at the till's find box it finds tonight's bookings made with it.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { resetRateLimits } from '#kit/ratelimit'
import { openSession } from '../../../payments/server/services'
import { scan } from '../../server/door'
import { issuePass } from '../../server/pass-holding'
import { listPassTypes } from '../../server/passes'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { inContext, person } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.pass.manage'])
const steward = person(['box-office.ticket.admit'])
const TONIGHT = NOV_16 + 7.5 * 3_600_000 // 19:30 on the day the clock is set to
let tonight: House
let later: House
let names = 0

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function newPass(paid: boolean) {
  const made = await req('POST', '/api/box-office/pass-types', { name: `Door pass ${++names}`, covers: 'productions', productionIds: [tonight.productionId], perShow: 'any', reserveUnpaid: true, prices: [{ name: 'Member', amountMinor: 2100 }], onSale: true }, seller)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const type = (await inContext(() => listPassTypes())).find(t => t.id === made.body.id)!
  const holder = await commit(async unit => (await findOrCreateAccount(unit.view(), { address: `door.pass.${names}@example.org`, name: 'Sam Patel', origin: 'guest' })).accountId)
  return commit(unit => issuePass(unit.view(), { passTypeId: type.id, passPriceId: type.prices[0]!.id, accountId: holder, paid, issuedBy: null }))
}
const entry = (performanceId: string, code: string) => ({ sale: { performanceId, lines: [], passes: [{ code }] } })
const atDoor = (code: string, performanceId = tonight.performanceId) => inContext(() => scan({ performanceId, code }), steward)
const find = async (q: string) => (await req('GET', `/api/box-office/desk/orders?q=${encodeURIComponent(q)}`, undefined, seller)).body.orders as { orderId: string, state: string }[]

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  tonight = await house(30, { startsAt: TONIGHT })
  later = await house(30, { of: tonight })
  await inContext(() => ensureManagedTicketTypes())
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

describe('a pass code at the door', () => {
  it('admits the entry it booked tonight, once', async () => {
    const pass = await newPass(true)
    const booked = await req('POST', '/api/box-office/desk/issue', entry(tonight.performanceId, pass.code), seller)
    expect(booked.status, JSON.stringify(booked.body)).toBe(200)
    const first = await atDoor(pass.code.toLowerCase())
    expect(first).toMatchObject({ result: 'admitted', booking: { reference: booked.body.reference, admitted: 1, tickets: 1 } })
    expect(first.scanId).not.toBeNull()
    expect(await atDoor(pass.code)).toMatchObject({ result: 'already_admitted' })
  })

  it('sends a reservation made with it to pay, with what is owed', async () => {
    const pass = await newPass(false)
    const reserved = await req('POST', '/api/box-office/desk/reserve', { ...entry(tonight.performanceId, pass.code), expectedTotalMinor: 2100 }, seller)
    expect(reserved.status, JSON.stringify(reserved.body)).toBe(200)
    expect(await atDoor(pass.code)).toMatchObject({ result: 'not_paid', scanId: null, reservation: { reference: reserved.body.reference, tickets: 1, amountDueMinor: 2100 } })
  })

  it('with no booking tonight admits nobody and records nothing', async () => {
    const pass = await newPass(true)
    expect((await req('POST', '/api/box-office/desk/issue', entry(later.performanceId, pass.code), seller)).status).toBe(200)
    expect(await atDoor(pass.code)).toMatchObject({ result: 'pass', scanId: null })
  })
})

describe('a pass code in the till\'s find box', () => {
  it('finds the bookings it made for tonight, and none for another night', async () => {
    const pass = await newPass(true)
    expect(await find(pass.code)).toEqual([])
    const elsewhere = await req('POST', '/api/box-office/desk/issue', entry(later.performanceId, pass.code), seller)
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(200)
    expect(await find(pass.code)).toEqual([])
    const booked = await req('POST', '/api/box-office/desk/issue', entry(tonight.performanceId, pass.code), seller)
    expect(booked.status, JSON.stringify(booked.body)).toBe(200)
    expect(await find(pass.code.replace(/-/g, ' '))).toMatchObject([{ orderId: booked.body.orderId, state: 'confirmed' }])
  })
})
