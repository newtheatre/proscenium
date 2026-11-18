// Reserve now, pay on arrival (R-1, R-2, R-7; Box office specification, part 3 and the test plan's
// "Reserve now, pay on arrival"): a reservation claims seats like a sale and no sweep can take them,
// it needs an account and, when the theatre asks, a proved address, its limits hold with many
// requests at once, the link in the email reduces or cancels it, and none of it touches the ledger.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, newId, openSpecial, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { hashOf } from '../../server/codes'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const HOUR = 3_600_000
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
const pool = async (h: House) => (await rows<{ id: string, capacity: number, claimed: number }>('SELECT id, capacity, claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const money = () => Promise.all(['finance_postings', 'finance_entries', 'payments_intents', 'payments_attempts', 'box_office_tickets'].map(t => count(`SELECT count(*) AS n FROM ${t}`)))

async function set(key: string, value: unknown): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

/** A basket of `quantity` full-price tickets, through the service. */
async function basket(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(`no basket: ${made.code}`)
  return made.basket
}

let guests = 0
const address = () => `guest${++guests}@example.org`

/** Presses Reserve as a guest. */
function reserve(b: { orderId: string, token: string, totalMinor: number }, email: string | undefined, actor: ReturnType<typeof person> | null = null, total = b.totalMinor) {
  return req('POST', `/api/box-office/baskets/${b.orderId}/reserve`, { expectedTotalMinor: total, ...(email ? { email, name: 'Guest Buyer' } : {}) }, actor, { 'x-basket-token': b.token })
}

/** The sealed variables of the newest message of a type about an order, as the buyer's email shows them. */
async function mail(typeKey: string, orderId: string): Promise<Record<string, string>> {
  const [row] = await rows<{ payload: string, sealed_variables: string | null }>('SELECT payload, sealed_variables FROM core_notifications WHERE type_key IN (?, ? || \'-guest\') AND subject_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', typeKey, typeKey, orderId)
  expect(row, `no ${typeKey} message`).toBeTruthy()
  const sealed = row!.sealed_variables ? JSON.parse((await inContext(() => openSpecial(row!.sealed_variables)))!) : {}
  return { ...JSON.parse(row!.payload), ...sealed }
}

const tokenOf = (link: string) => link.slice(link.lastIndexOf('/') + 1)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

describe('reserving as a guest, with a confirmed address asked for', () => {
  it('keeps the basket a basket until the link in the email is pressed, then reserves it and posts nothing', async () => {
    const h = await house(10)
    const before = await money()
    const b = await basket(h, 2)
    const email = address()
    const asked = await reserve(b, email)
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(asked.body).toEqual({ state: 'confirm-email', orderId: b.orderId, expiresAt: b.expiresAt })
    expect(await order(b.orderId)).toMatchObject({ state: 'basket', account_id: null, desk_code_hash: null, confirm_email: email, confirm_name: 'Guest Buyer', confirm_expires_at: b.expiresAt })
    // Nobody has an account yet: a mistyped address leaves nothing behind.
    expect(await count('SELECT count(*) AS n FROM core_account_emails WHERE address = ?', email)).toBe(0)

    const confirm = await mail('box-office.reservation-confirm', b.orderId)
    expect(confirm.link).toMatch(/^http:\/\/test\/book\/confirm\//)
    const done = await req('POST', '/api/box-office/reservations/confirm', { token: tokenOf(confirm.link!) }, null)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'reserved', orderId: b.orderId, reference: b.reference, amountDueMinor: b.totalMinor, releaseAt: null })

    const o = await order(b.orderId)
    expect(o).toMatchObject({ state: 'reserved', signed_in: 0, expires_at: null, intent_id: null, total_minor: b.totalMinor, confirm_token_hash: null, confirm_email: null, confirm_name: null, confirm_expires_at: null })
    const [account] = await rows<{ id: string, origin: string, first_signed_in_at: number | null }>('SELECT a.id, a.origin, a.first_signed_in_at FROM core_accounts a JOIN core_account_emails e ON e.account_id = a.id WHERE e.address = ?', email)
    expect(account).toMatchObject({ id: o.account_id, origin: 'guest', first_signed_in_at: null })
    // The seats are claimed as a sale claims them: confirmed, with no expiry, under a reservation hold.
    expect(await rows('SELECT c.state, c.expires_at, h.kind FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', b.orderId))
      .toEqual([{ state: 'confirmed', expires_at: null, kind: 'reservation' }, { state: 'confirmed', expires_at: null, kind: 'reservation' }])
    expect((await pool(h)).claimed).toBe(2)
    // No intent, no tickets, no posting.
    expect(await money()).toEqual(before)
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.reserved' AND record_id = ?", b.orderId)).toBe(1)

    // The message carries the reference, the desk code, what is owed and the link; the database holds only hashes.
    const told = await mail('box-office.order-reserved', b.orderId)
    expect(told).toMatchObject({ reference: b.reference, tickets: '2 × Full price', deskCode: done.body.deskCode })
    expect(told.amountDue).toContain('24.00')
    expect(told.doors).toMatch(/\d/)
    expect(tokenOf(told.link!)).toBe(done.body.token)
    expect(o.link_token_hash).toBe(await hashOf(done.body.token))
    expect(o.desk_code_hash).toBe(await hashOf(done.body.deskCode))
    const stored = JSON.stringify(await rows('SELECT * FROM box_office_orders WHERE id = ?', b.orderId)) + JSON.stringify(await rows('SELECT payload FROM core_notifications WHERE subject_id = ?', b.orderId))
    for (const secret of [done.body.token, done.body.deskCode, b.token, tokenOf(confirm.link!)]) expect(stored).not.toContain(secret)
    expect(stored).not.toContain(email)

    // The browser that made the basket still sees what became of it; the link pressed again reserves nothing more.
    expect((await req('GET', `/api/box-office/baskets/${b.orderId}`, undefined, null, { 'x-basket-token': b.token })).body).toMatchObject({ state: 'reserved' })
    const again = await req('POST', '/api/box-office/reservations/confirm', { token: tokenOf(confirm.link!) }, null)
    expect(again.status).toBe(404)
    expect(again.body).toMatchObject({ code: 'box-office.reservation.link-invalid' })
    expect((await pool(h)).claimed).toBe(2)
  })

  it('reserves nothing when the link is pressed after the basket has run out, or is not one of ours', async () => {
    const h = await house(4)
    const b = await basket(h, 4)
    expect((await reserve(b, address())).body.state).toBe('confirm-email')
    const confirm = await mail('box-office.reservation-confirm', b.orderId)
    advanceClock(HOUR)
    const late = await req('POST', '/api/box-office/reservations/confirm', { token: tokenOf(confirm.link!) }, null)
    // One answer, whatever is wrong with the link.
    expect(late.status).toBe(404)
    expect(late.body).toMatchObject({ code: 'box-office.reservation.link-invalid' })
    expect((await order(b.orderId)).state).toBe('basket')
    // The seats went back on sale with the lapsed hold.
    expect((await buy(h, 4)).ok).toBe(true)
    expect((await req('POST', '/api/box-office/reservations/confirm', { token: 'bm90LW91cnM' }, null)).body).toEqual(late.body)
    expect((await req('POST', '/api/box-office/reservations/confirm', { token: b.token }, null)).body).toEqual(late.body)
  })

  it('sends a new link when asked again with the address put right, and the first stops working', async () => {
    const h = await house(4)
    const b = await basket(h, 1)
    await reserve(b, 'mistyped@example.org')
    const first = await mail('box-office.reservation-confirm', b.orderId)
    const right = address()
    advanceClock(1000)
    expect((await reserve(b, right)).body.state).toBe('confirm-email')
    const second = await mail('box-office.reservation-confirm', b.orderId)
    expect(second.link).not.toBe(first.link)
    expect((await req('POST', '/api/box-office/reservations/confirm', { token: tokenOf(first.link!) }, null)).status).toBe(404)
    expect((await req('POST', '/api/box-office/reservations/confirm', { token: tokenOf(second.link!) }, null)).body.state).toBe('reserved')
    expect(await count('SELECT count(*) AS n FROM core_account_emails WHERE address = ?', 'mistyped@example.org')).toBe(0)
    expect(await count('SELECT count(*) AS n FROM core_account_emails WHERE address = ?', right)).toBe(1)
  })

  it('needs an address from a guest, the right basket token and the total the buyer saw', async () => {
    const h = await house(4)
    const b = await basket(h, 1)
    expect((await reserve(b, undefined)).body).toMatchObject({ code: 'box-office.reservation.email-needed' })
    expect((await reserve({ ...b, token: 'wrong' }, address())).status).toBe(404)
    expect((await reserve(b, address(), null, b.totalMinor + 1)).body).toMatchObject({ code: 'box-office.order.total-changed' })
    expect((await order(b.orderId)).state).toBe('basket')
  })

  it('reserves at once for a buyer who is signed in', async () => {
    const h = await house(4)
    const b = await basket(h, 1)
    const buyer = person([])
    await rows("INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, 'Signed In', 'self', ?, ?) RETURNING id", buyer.accountId, NOV_16, NOV_16)
    const done = await reserve(b, undefined, buyer)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.state).toBe('reserved')
    expect(await order(b.orderId)).toMatchObject({ state: 'reserved', account_id: buyer.accountId, signed_in: 1 })
  })
})

describe('reserving with no confirmation asked for', () => {
  beforeAll(() => set('box-office.reservations.confirm-email', false))

  it('holds the last seat against every later buyer, however long passes', async () => {
    const h = await house(1)
    const b = await basket(h, 1)
    const done = await reserve(b, address())
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.state).toBe('reserved')
    advanceClock(24 * HOUR)
    const outcomes = await Promise.all(Array.from({ length: 20 }, () => buy(h, 1)))
    expect(outcomes.filter(o => o.ok)).toHaveLength(0)
    expect((await pool(h)).claimed).toBe(1)
    // Pressed again, it is reserved already.
    expect((await reserve(b, address())).body).toMatchObject({ code: 'box-office.reservation.already-reserved' })
  })

  it('refuses a basket that has run out', async () => {
    const h = await house(2)
    const b = await basket(h, 2)
    advanceClock(HOUR)
    expect((await reserve(b, address())).body).toMatchObject({ code: 'box-office.basket.expired' })
  })

  it('sets the release time from the setting, before the start', async () => {
    await set('box-office.reservations.release-before', 1800)
    const h = await house(2)
    const done = await reserve(await basket(h, 1), address())
    const [performance] = await rows<{ starts_at: number }>('SELECT starts_at FROM core_performances WHERE id = ?', h.performanceId)
    expect(done.body.releaseAt).toBe(performance!.starts_at - 1800 * 1000)
    expect((await order(done.body.orderId)).release_at).toBe(done.body.releaseAt)
    await set('box-office.reservations.release-before', null)
  })

  it('keeps to the most tickets in one reservation', async () => {
    await set('box-office.reservations.max-tickets-per-order', 2)
    const h = await house(10)
    const b = await basket(h, 3)
    expect((await reserve(b, address())).body).toMatchObject({ code: 'box-office.reservation.too-many' })
    expect((await reserve(await basket(h, 2), address())).body.state).toBe('reserved')
    await set('box-office.reservations.max-tickets-per-order', 8)
  })

  it('keeps one person to the limit for a performance, with their reservations made at once', async () => {
    await set('box-office.reservations.max-tickets-per-person', 4)
    const email = address()
    // The account exists already, from a reservation for another performance, which does not count here.
    expect((await reserve(await basket(await house(4), 4), email)).body.state).toBe('reserved')
    const h = await house(40)
    const baskets = await Promise.all(Array.from({ length: 6 }, () => basket(h, 2)))
    const outcomes = await Promise.all(baskets.map(b => reserve(b, email)))
    expect(outcomes.filter(o => o.status === 200)).toHaveLength(2)
    expect(new Set(outcomes.filter(o => o.status !== 200).map(o => o.body.code))).toEqual(new Set(['box-office.reservation.person-limit']))
    expect(await count("SELECT count(*) AS n FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id WHERE l.performance_id = ? AND o.state = 'reserved' AND l.state = 'live'", h.performanceId)).toBe(4)
    // Somebody else is not held to this person's count.
    expect((await reserve(await basket(h, 4), address())).body.state).toBe('reserved')
    await set('box-office.reservations.max-tickets-per-person', 8)
  })
})

describe('the link in the reservation message', () => {
  beforeAll(() => set('box-office.reservations.confirm-email', false))

  it('shows the booking, reduces it and cancels it, releasing seats at once and posting nothing', async () => {
    const h = await house(3)
    const before = await money()
    const done = await reserve(await basket(h, 3), address())
    const link = { 'x-order-token': done.body.token as string }
    const seen = await req('GET', '/api/box-office/orders/link', undefined, null, link)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body).toMatchObject({ reference: done.body.reference, state: 'reserved', amountDueMinor: 3600 })
    expect(seen.body.lines).toHaveLength(3)
    // One band: no part of the house to name. With a second, each ticket says which part it is in.
    expect(seen.body.lines[0].band).toBeNull()
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/bands`, { name: 'Wheelchair spaces' })).status).toBe(200)
    expect((await req('GET', '/api/box-office/orders/link', undefined, null, link)).body.lines[0]).toMatchObject({ band: 'Stalls' })
    expect((await buy(h, 1)).ok).toBe(false)

    // One fewer: its seat can be sold straight away and the amount due falls.
    const reduced = await req('POST', '/api/box-office/orders/link/cancel', { lineIds: [seen.body.lines[0].id] }, null, link)
    expect(reduced.status, JSON.stringify(reduced.body)).toBe(200)
    expect(reduced.body).toMatchObject({ state: 'reserved', amountDueMinor: 2400 })
    expect(reduced.body.lines).toHaveLength(2)
    expect((await pool(h)).claimed).toBe(2)
    expect((await buy(h, 1)).ok).toBe(true)
    expect(await order(done.body.orderId)).toMatchObject({ state: 'reserved', total_minor: 2400 })
    // The same ticket cannot be given up twice.
    expect((await req('POST', '/api/box-office/orders/link/cancel', { lineIds: [seen.body.lines[0].id] }, null, link)).body).toMatchObject({ code: 'box-office.order.lines-changed' })

    const cancelled = await req('POST', '/api/box-office/orders/link/cancel', {}, null, link)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body).toMatchObject({ state: 'cancelled', amountDueMinor: 0, lines: [] })
    const o = await order(done.body.orderId)
    expect(o).toMatchObject({ state: 'cancelled', total_minor: 0 })
    expect(o.cancelled_at).not.toBeNull()
    expect(await count("SELECT count(*) AS n FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ? AND c.state = 'released' AND c.release_reason = 'cancelled'", done.body.orderId)).toBe(3)
    expect(await rows('SELECT kind, "by", fee_minor, refund_id FROM box_office_cancellations WHERE order_id = ? ORDER BY created_at', done.body.orderId))
      .toEqual([{ kind: 'customer', by: null, fee_minor: 0, refund_id: null }, { kind: 'customer', by: null, fee_minor: 0, refund_id: null }])
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.cancelled' AND record_id = ?", done.body.orderId)).toBe(2)
    expect(await count("SELECT count(*) AS n FROM core_notifications WHERE type_key = 'box-office.order-cancelled' AND subject_id = ?", done.body.orderId)).toBe(2)
    expect(await money()).toEqual(before)

    // Cancelled is final from the link, and a made-up link opens nothing.
    expect((await req('POST', '/api/box-office/orders/link/cancel', {}, null, link)).status).toBe(409)
    expect((await req('GET', '/api/box-office/orders/link', undefined, null, { 'x-order-token': newId('ord') })).status).toBe(404)
    expect((await req('POST', '/api/box-office/orders/link/cancel', {}, null, {})).status).toBe(404)
  })
})
