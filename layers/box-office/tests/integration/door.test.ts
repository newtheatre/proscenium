// The door (BO-40; Box office specification, part 4, "The door"): a valid ticket is admitted once,
// however many devices scan it together; a second scan says Already in, with when and where; a
// ticket for another performance, a void ticket and a code that is not ours each say so; and a desk
// code or a booking reference says Not paid and writes no scan row.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const steward = person(['box-office.ticket.admit'])
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
let guests = 0

/** A house whose tickets are free, so an order is confirmed, with its door codes, at checkout. */
async function freeHouse(capacity: number): Promise<House> {
  const h = await house(capacity)
  expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 0 }] })).status).toBe(200)
  return h
}

async function tickets(h: House, quantity: number): Promise<string[]> {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/checkout`, { expectedTotalMinor: 0, email: `door${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('confirmed')
  return done.body.doorCodes
}

const scan = (h: House, code: string, deviceLabel?: string, actor = steward) => req('POST', `/api/box-office/performances/${h.performanceId}/scan`, { code, ...(deviceLabel ? { deviceLabel } : {}) }, actor)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('scanning at the door', () => {
  it('admits a valid ticket, and says Already in, with when and where, on a second scan', async () => {
    const h = await freeHouse(4)
    const [code] = await tickets(h, 1)
    const first = await scan(h, code!, 'Left door')
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body).toMatchObject({ result: 'admitted' })
    advanceClock(60_000)
    const second = await scan(h, code!, 'Right door')
    expect(second.body).toMatchObject({ result: 'already_admitted', admittedAt: NOV_16, admittedAtDoor: 'Left door', ticketId: first.body.ticketId })
    expect(await rows('SELECT result, device_label, scanned_by FROM box_office_scans WHERE ticket_id = ? ORDER BY scanned_at', first.body.ticketId))
      .toEqual([{ result: 'admitted', device_label: 'Left door', scanned_by: steward.accountId }, { result: 'already_admitted', device_label: 'Right door', scanned_by: steward.accountId }])
    expect((await rows<{ admitted_at: number }>('SELECT admitted_at FROM box_office_tickets WHERE id = ?', first.body.ticketId))[0]!.admitted_at).toBe(NOV_16)
  })

  it('admits once when twenty devices scan the same ticket together', async () => {
    const h = await freeHouse(4)
    const [code] = await tickets(h, 1)
    resetRateLimits()
    const outcomes = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(h, code!, `Door ${i}`)))
    expect(outcomes.filter(o => o.body.result === 'admitted')).toHaveLength(1)
    expect(outcomes.filter(o => o.body.result === 'already_admitted')).toHaveLength(19)
    expect(await count("SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ? AND result = 'admitted'", h.performanceId)).toBe(1)
    expect(await count('SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ?', h.performanceId)).toBe(20)
  })

  it('says so for a ticket for another performance, a void ticket, a forged code and a code that is not ours', async () => {
    const h = await freeHouse(4)
    const other = await freeHouse(4)
    const [code, second] = await tickets(h, 2)
    expect((await scan(other, code!)).body).toMatchObject({ result: 'wrong_performance', ticketPerformanceId: h.performanceId })

    const [kind, keyId, random, signature] = second!.split('.') as [string, string, string, string]
    const forged = `${kind}.${keyId}.${random.slice(0, -1)}${random.endsWith('A') ? 'B' : 'A'}.${signature}`
    expect((await scan(h, forged)).body).toMatchObject({ result: 'bad_signature' })
    expect((await scan(h, 'not a ticket at all')).body).toMatchObject({ result: 'unknown' })

    await rows("UPDATE box_office_tickets SET state = 'void', void_reason = 'cancelled' WHERE order_line_id IN (SELECT order_line_id FROM box_office_tickets WHERE performance_id = ?) RETURNING id", h.performanceId)
    expect((await scan(h, second!)).body).toMatchObject({ result: 'void', voidReason: 'cancelled' })
    // Nobody was admitted by any of that.
    expect(await count('SELECT count(*) AS n FROM box_office_tickets WHERE performance_id = ? AND admitted_at IS NOT NULL', h.performanceId)).toBe(0)
    expect(await rows('SELECT result FROM box_office_scans WHERE performance_id IN (?, ?) ORDER BY result', h.performanceId, other.performanceId))
      .toEqual([{ result: 'bad_signature' }, { result: 'unknown' }, { result: 'void' }, { result: 'wrong_performance' }])
  })

  it('says Not paid for a desk code or a booking reference, and writes no scan row', async () => {
    const h = await house(4)
    const made = await buy(h, 1)
    if (!made.ok) throw new Error(made.code)
    const reserved = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `door${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
    expect(reserved.body.state, JSON.stringify(reserved.body)).toBe('reserved')
    expect((await scan(h, reserved.body.deskCode)).body).toEqual({ result: 'not_paid', scanId: null })
    expect((await scan(h, reserved.body.reference)).body).toEqual({ result: 'not_paid', scanId: null })
    expect(await count('SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ?', h.performanceId)).toBe(0)
  })

  it('is for people who may admit', async () => {
    const h = await freeHouse(2)
    const [code] = await tickets(h, 1)
    expect((await scan(h, code!, undefined, person([]))).status).toBe(403)
    expect(await count('SELECT count(*) AS n FROM box_office_tickets WHERE performance_id = ? AND admitted_at IS NOT NULL', h.performanceId)).toBe(0)
  })
})
