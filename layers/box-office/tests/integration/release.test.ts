// Letting seats go (R-6; Box office specification, part 3): the sweep expires a lapsed basket; the
// release task expires reservations at the time set before the start, skipping one marked to keep
// and one not yet due; staff release by hand; and none of it touches the ledger.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import sweepHolds from '../../server/tasks/sweep-holds'
import releaseReservations from '../../server/tasks/release-reservations'
import { dueReservations, lapsedBaskets, releaseReservation } from '../../server/release'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const HOUR = 3_600_000
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
const pool = async (h: House) => (await rows<{ claimed: number }>('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const staff = person(['box-office.order.release'])

async function set(key: string, value: unknown): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

async function basket(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(`no basket: ${made.code}`)
  return made.basket
}

let guests = 0
async function reserved(h: House, quantity: number) {
  const b = await basket(h, quantity)
  const done = await req('POST', `/api/box-office/baskets/${b.orderId}/reserve`, { expectedTotalMinor: b.totalMinor, email: `late${++guests}@example.org`, name: 'Late Comer' }, null, { 'x-basket-token': b.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  return done.body as { orderId: string, token: string, releaseAt: number }
}

/** Runs a task as the scheduler would. */
const runTask = (task: unknown) => inContext(() => (task as () => Promise<void>)(), { kind: 'job' })

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await set('box-office.reservations.confirm-email', false)
  await set('box-office.reservations.release-before', 1800)
})

describe('the sweep', () => {
  it('expires a lapsed basket, with the address it was waiting to confirm, and leaves a live one', async () => {
    await set('box-office.reservations.confirm-email', true)
    const h = await house(4)
    const old = await basket(h, 2)
    await req('POST', `/api/box-office/baskets/${old.orderId}/reserve`, { expectedTotalMinor: old.totalMinor, email: 'never-confirmed@example.org' }, null, { 'x-basket-token': old.token })
    await set('box-office.reservations.confirm-email', false)
    advanceClock(HOUR)
    const fresh = await basket(h, 1)
    expect(await inContext(() => lapsedBaskets())).toContain(old.orderId)
    await runTask(sweepHolds)
    expect(await order(old.orderId)).toMatchObject({ state: 'expired', confirm_email: null, confirm_token_hash: null })
    expect((await order(fresh.orderId)).state).toBe('basket')
    expect((await pool(h)).claimed).toBe(1)
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.expired' AND record_id = ?", old.orderId)).toBe(1)
    expect(await inContext(() => lapsedBaskets())).not.toContain(old.orderId)
  })
})

describe('releasing reservations', () => {
  it('releases at the time set before the start, tells the buyer, and skips one marked to keep and one not yet due', async () => {
    const soon = NOV_16 + 2 * HOUR
    const h = await house(6, { startsAt: soon })
    const later = await house(6, { startsAt: soon + 48 * HOUR })
    const gone = await reserved(h, 2)
    const kept = await reserved(h, 1)
    const notDue = await reserved(later, 1)
    expect(gone.releaseAt).toBe(soon - 1800 * 1000)
    expect((await req('POST', `/api/box-office/orders/${kept.orderId}/keep`, { keep: true }, staff)).status).toBe(200)
    const postings = await count('SELECT count(*) AS n FROM finance_postings')

    // Before the time, nothing is due.
    expect(await inContext(() => dueReservations())).toEqual([])
    advanceClock(2 * HOUR - 1800 * 1000)
    expect(await inContext(() => dueReservations())).toEqual([gone.orderId])
    await runTask(releaseReservations)

    expect(await order(gone.orderId)).toMatchObject({ state: 'expired', release_at: null })
    expect(await rows('SELECT DISTINCT c.state, c.release_reason FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', gone.orderId)).toEqual([{ state: 'released', release_reason: 'expired' }])
    expect((await order(kept.orderId)).state).toBe('reserved')
    expect((await order(notDue.orderId)).state).toBe('reserved')
    expect((await pool(h)).claimed).toBe(1)
    expect(await count("SELECT count(*) AS n FROM core_notifications WHERE type_key = 'box-office.reservation-released' AND subject_id = ?", gone.orderId)).toBe(1)
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.expired' AND record_id = ?", gone.orderId)).toBe(1)
    expect(await count('SELECT count(*) AS n FROM finance_postings')).toBe(postings)
    // The link shows what became of it, and cancels nothing now.
    expect((await req('GET', '/api/box-office/orders/link', undefined, null, { 'x-order-token': gone.token })).body).toMatchObject({ state: 'expired' })
    expect((await req('POST', '/api/box-office/orders/link/cancel', {}, null, { 'x-order-token': gone.token })).status).toBe(409)

    // The task cannot be made to release a kept order; unmarked, it goes on the next run.
    await expect(inContext(async () => {
      const unit = createUnit()
      await releaseReservation(unit.view(), kept.orderId, 'task')
      await unit.commit()
    })).rejects.toMatchObject({ code: 'box-office.order.not-reserved' })
    expect((await req('POST', `/api/box-office/orders/${kept.orderId}/keep`, { keep: false }, staff)).status).toBe(200)
    await runTask(releaseReservations)
    expect((await order(kept.orderId)).state).toBe('expired')
    expect((await pool(h)).claimed).toBe(0)
  })

  it('lets staff with the ability release one by hand, once, and nobody else', async () => {
    const h = await house(3)
    const r = await reserved(h, 3)
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/release`, {}, person([]))).status).toBe(403)
    const done = await req('POST', `/api/box-office/orders/${r.orderId}/release`, {}, staff)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect((await order(r.orderId)).state).toBe('expired')
    expect(await rows('SELECT DISTINCT c.release_reason FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', r.orderId)).toEqual([{ release_reason: 'staff' }])
    expect((await buy(h, 3)).ok).toBe(true)
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/release`, {}, staff)).body).toMatchObject({ code: 'box-office.order.not-reserved' })
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/keep`, { keep: true }, staff)).status).toBe(409)
  })
})
