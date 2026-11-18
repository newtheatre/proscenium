// Promo codes (BO-17): made and retired by staff, typed by a buyer when they hold tickets. The code
// takes money off the dearest tickets it is for, up to its limits; the last use is given once; and a
// basket that lapses gives its uses back.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, createUnit, nowMs, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import codesGet from '../../server/api/box-office/promo-codes/index.get'
import codesPost from '../../server/api/box-office/promo-codes/index.post'
import codePut from '../../server/api/box-office/promo-codes/[id].put'
import codeActive from '../../server/api/box-office/promo-codes/[id]/active.post'
import promoGet from '../../server/api/box-office/book/performances/[id]/promo.get'
import { createBasket } from '../../server/baskets'
import { expireBasket } from '../../server/release'
import { house, NOV_16, ready, type House } from './stage'

const handle = server({
  'GET /api/box-office/promo-codes': codesGet,
  'POST /api/box-office/promo-codes': codesPost,
  'PUT /api/box-office/promo-codes/:id': codePut,
  'POST /api/box-office/promo-codes/:id/active': codeActive,
  'GET /api/box-office/book/performances/:id/promo': promoGet,
})
const staff = person(['box-office.promo.manage'])
let keys = 0
async function api<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | undefined = staff): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'GET' ? {} : { 'idempotency-key': `prm${++keys}` } })
  return { status: response.status, body: await response.json() as T }
}

let codes = 0
async function code(fields: Record<string, unknown>): Promise<{ id: string, code: string }> {
  const name = `TEST${++codes}`
  const made = await api('POST', '/api/box-office/promo-codes', { code: name, ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return { id: made.body.id, code: name }
}

type Result = { ok: true, totalMinor: number, orderId: string, lines: { ticketTypeId: string, amountMinor: number }[] } | { ok: false, code: string }
async function hold(h: House, promoCode: string | undefined, full: number, concession = 0): Promise<Result> {
  const lines = [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: full }, { bandId: h.bandId, ticketTypeId: h.concessionId, quantity: concession }].filter(l => l.quantity)
  try {
    const basket = await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines, promoCode })
      await unit.commit()
      return made
    })
    return { ok: true, ...basket }
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false, code: error.code }
  }
}
const used = async (id: string) => (await rows<{ used: number }>('SELECT used FROM box_office_promo_codes WHERE id = ?', id))[0]!.used

let h: House
beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  h = await house(50)
})

describe('a promo code', () => {
  it('takes a percentage off every ticket it is for, and records the discount on each line', async () => {
    const c = await code({ effect: 'percent_off', value: 2500 })
    const b = await hold(h, c.code.toLowerCase(), 2, 1)
    expect(b.ok && b.totalMinor).toBe(900 + 900 + 600)
    expect(await rows('SELECT list_minor, discount_minor, amount_minor FROM box_office_order_lines WHERE order_id = ? ORDER BY list_minor DESC, id', (b as { orderId: string }).orderId)).toEqual([
      { list_minor: 1200, discount_minor: 300, amount_minor: 900 },
      { list_minor: 1200, discount_minor: 300, amount_minor: 900 },
      { list_minor: 800, discount_minor: 200, amount_minor: 600 },
    ])
    expect(await used(c.id)).toBe(3)
  })

  it('takes an amount off, or sets a price, only on the type it is for, and never below nothing', async () => {
    const off = await code({ effect: 'amount_off', value: 1000, ticketTypeId: h.concessionId })
    const b = await hold(h, off.code, 1, 1)
    expect(b.ok && b.totalMinor).toBe(1200 + 0)
    const set = await code({ effect: 'set_price', value: 500 })
    const c = await hold(h, set.code, 1, 1)
    expect(c.ok && c.totalMinor).toBe(500 + 500)
  })

  it('discounts only as many tickets as it allows for one order, the dearest first', async () => {
    const c = await code({ effect: 'amount_off', value: 200, maxPerOrder: 1 })
    const b = await hold(h, c.code, 1, 2)
    expect(b.ok && b.totalMinor).toBe(1000 + 800 + 800)
    expect(await used(c.id)).toBe(1)
  })

  it('gives its last use once, and refuses a second buyer', async () => {
    const c = await code({ effect: 'percent_off', value: 10000, maxUses: 1 })
    const [a, b] = await Promise.all([hold(h, c.code, 1), hold(h, c.code, 1)])
    expect([a, b].filter(r => r.ok)).toHaveLength(1)
    expect([a, b].find(r => !r.ok)).toMatchObject({ code: 'box-office.promo.used-up' })
    expect(await used(c.id)).toBe(1)
    // The preview says so too.
    expect((await api('GET', `/api/box-office/book/performances/${h.performanceId}/promo?code=${c.code}`, undefined, undefined)).body.code).toBe('box-office.promo.used-up')
  })

  it('gives its uses back when the basket lapses', async () => {
    const c = await code({ effect: 'percent_off', value: 5000, maxUses: 2 })
    const b = await hold(h, c.code, 2)
    expect(await used(c.id)).toBe(2)
    advanceClock(86_400_000)
    await inContext(async () => {
      const unit = createUnit()
      expireBasket(unit.view(), (b as { orderId: string }).orderId)
      await unit.commit()
    })
    expect(await used(c.id)).toBe(0)
    expect(await rows('SELECT DISTINCT state FROM box_office_promo_redemptions WHERE promo_code_id = ?', c.id)).toEqual([{ state: 'released' }])
    expect((await hold(h, c.code, 2)).ok).toBe(true)
  })

  it('is refused when unknown, retired, not yet valid, past its end or for another show', async () => {
    expect(await hold(h, 'NOSUCHCODE', 1)).toMatchObject({ code: 'box-office.promo.unknown' })
    const retired = await code({ effect: 'percent_off', value: 1000 })
    expect((await api('POST', `/api/box-office/promo-codes/${retired.id}/active`, { active: false })).status).toBe(200)
    expect(await hold(h, retired.code, 1)).toMatchObject({ code: 'box-office.promo.expired' })
    const later = await code({ effect: 'percent_off', value: 1000, validFrom: nowMs() + 86_400_000 })
    expect(await hold(h, later.code, 1)).toMatchObject({ code: 'box-office.promo.not-yet' })
    const ending = await code({ effect: 'percent_off', value: 1000, validUntil: nowMs() + 60_000 })
    expect((await hold(h, ending.code, 1)).ok).toBe(true)
    advanceClock(120_000)
    expect(await hold(h, ending.code, 1)).toMatchObject({ code: 'box-office.promo.expired' })
    const other = await house(10)
    const elsewhere = await code({ effect: 'percent_off', value: 1000, productionId: other.productionId })
    expect(await hold(h, elsewhere.code, 1)).toMatchObject({ code: 'box-office.promo.not-here' })
    const concessionOnly = await code({ effect: 'percent_off', value: 1000, ticketTypeId: h.concessionId })
    expect(await hold(h, concessionOnly.code, 1)).toMatchObject({ code: 'box-office.promo.no-tickets' })
  })

  it('is previewed for a buyer with the prices it gives', async () => {
    const c = await code({ effect: 'amount_off', value: 300, maxPerOrder: 2 })
    const preview = await api('GET', `/api/box-office/book/performances/${h.performanceId}/promo?code=${c.code.toLowerCase()}`, undefined, undefined)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body).toMatchObject({ code: c.code, effect: 'amount_off', maxPerOrder: 2 })
    expect(preview.body.prices).toEqual(expect.arrayContaining([
      { bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 900 },
      { bandId: h.bandId, ticketTypeId: h.concessionId, amountMinor: 500 },
    ]))
  })
})

describe('managing codes', () => {
  it('keeps codes unique whatever the case, and will not lower the uses below those made', async () => {
    const c = await code({ effect: 'percent_off', value: 1000 })
    expect((await api('POST', '/api/box-office/promo-codes', { code: c.code.toLowerCase(), effect: 'percent_off', value: 500 })).status).toBe(409)
    await hold(h, c.code, 3)
    const lowered = await api('PUT', `/api/box-office/promo-codes/${c.id}`, { code: c.code, effect: 'percent_off', value: 1000, maxUses: 2 })
    expect(lowered.body.code).toBe('box-office.promo.below-used')
    const listed = await api('GET', '/api/box-office/promo-codes')
    expect(listed.body.rows.find((r: { id: string }) => r.id === c.id)).toMatchObject({ used: 3, active: true })
  })

  it('can be limited to one performance and one part of the house, listed with the production\'s', async () => {
    const listed = await api('GET', '/api/box-office/promo-codes')
    expect(listed.body.productions.find((p: { id: string }) => p.id === h.productionId)).toMatchObject({
      performances: expect.arrayContaining([expect.objectContaining({ id: h.performanceId })]),
      bands: expect.arrayContaining([expect.objectContaining({ id: h.bandId })]),
    })
    const c = await code({ effect: 'amount_off', value: 100, performanceId: h.performanceId, bandId: h.bandId })
    const saved = (await api('GET', '/api/box-office/promo-codes')).body.rows.find((r: { id: string }) => r.id === c.id)
    // A part of the house is its production's, so the code is for that production too.
    expect(saved).toMatchObject({ productionId: h.productionId, performanceId: h.performanceId, bandId: h.bandId })
    const b = await hold(h, c.code, 1)
    expect(b.ok && b.totalMinor).toBe(1100)
    const other = await house(5)
    const wrong = await api('POST', '/api/box-office/promo-codes', { code: `TEST${++codes}`, effect: 'amount_off', value: 100, productionId: other.productionId, bandId: h.bandId })
    expect(wrong.body.code).toBe('box-office.promo.scope')
  })

  it('is closed to someone who does not manage codes', async () => {
    expect((await api('GET', '/api/box-office/promo-codes', undefined, person([]))).status).toBe(403)
  })
})
