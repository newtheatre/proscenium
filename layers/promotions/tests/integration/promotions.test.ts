// Promotions (the unified promotions design), tried on tickets: made and retired by staff through
// the Promotions screen's routes, priced through Payments' payments.pricing when a buyer holds
// tickets, with the savings written on Box office's lines. The last use is given once; a use on a
// seat given back is released the next time the promotion is priced.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, createUnit, nowMs, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import listGet from '../../server/api/promotions/index.get'
import createPost from '../../server/api/promotions/index.post'
import updatePut from '../../server/api/promotions/[id].put'
import activePost from '../../server/api/promotions/[id]/active.post'
import promoGet from '../../../box-office/server/api/box-office/book/performances/[id]/promo.get'
import { basketByToken, createBasket } from '../../../box-office/server/baskets'
import { expireBasket } from '../../../box-office/server/release'
import { house, NOV_16, ready, type House } from '../../../box-office/tests/integration/stage'

const handle = server({
  'GET /api/promotions': listGet,
  'POST /api/promotions': createPost,
  'PUT /api/promotions/:id': updatePut,
  'POST /api/promotions/:id/active': activePost,
  'GET /api/box-office/book/performances/:id/promo': promoGet,
})
const staff = person(['promotions.promotion.manage'])
let keys = 0
async function api<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | undefined = staff): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'GET' ? {} : { 'idempotency-key': `prom${++keys}` } })
  return { status: response.status, body: await response.json() as T }
}

const TICKETS = 'box-office.ticket'
let made = 0
const body = (code: string | null, fields: Record<string, unknown>) => ({
  name: code ?? `Offer ${made}`, label: code ?? `Offer ${made}`, trigger: code ? 'code' : 'automatic', effect: 'percent_off', value: 1000,
  codes: code ? [{ code }] : [], targets: [{ role: 'applies', kind: TICKETS }], ...fields,
})
async function promotion(fields: Record<string, unknown>, automatic = false): Promise<{ id: string, code: string }> {
  const code = `TEST${++made}`
  const done = await api('POST', '/api/promotions', body(automatic ? null : code, fields))
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return { id: done.body.id, code }
}

type Result = { ok: true, totalMinor: number, orderId: string, token: string } | { ok: false, code: string }
async function hold(h: House, promoCode: string | undefined, full: number, concession = 0): Promise<Result> {
  const lines = [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: full }, { bandId: h.bandId, ticketTypeId: h.concessionId, quantity: concession }].filter(l => l.quantity)
  try {
    const basket = await inContext(async () => {
      const unit = createUnit()
      const out = await createBasket(unit.view(), { performanceId: h.performanceId, lines, promoCode })
      await unit.commit()
      return out
    })
    return { ok: true, ...basket } as Result
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false, code: error.code }
  }
}
const total = (r: Result) => r.ok ? r.totalMinor : r.code
const used = async (id: string) => (await rows<{ used: number }>('SELECT used FROM promotions_promotions WHERE id = ?', id))[0]!.used
const lines = (orderId: string) => rows<{ list_minor: number, discount_minor: number, amount_minor: number }>('SELECT list_minor, discount_minor, amount_minor FROM box_office_order_lines WHERE order_id = ? ORDER BY list_minor DESC, discount_minor DESC, id', orderId)

let h: House
beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  h = await house(80)
})

describe('a promotion on tickets', () => {
  it('takes a percentage off every ticket it is for, and records the discount on each line', async () => {
    const p = await promotion({ value: 2500 })
    const b = await hold(h, p.code.toLowerCase(), 2, 1)
    expect(total(b)).toBe(900 + 900 + 600)
    expect(await lines((b as { orderId: string }).orderId)).toEqual([
      { list_minor: 1200, discount_minor: 300, amount_minor: 900 },
      { list_minor: 1200, discount_minor: 300, amount_minor: 900 },
      { list_minor: 800, discount_minor: 200, amount_minor: 600 },
    ])
    expect(await used(p.id)).toBe(3)
    // The basket says which code it was held with and what it saved, for Check and pay.
    const seen = await inContext(() => basketByToken((b as { orderId: string }).orderId, (b as { token: string }).token))
    expect(seen).toMatchObject({ promo: { code: p.code, savingMinor: 800 } })
  })

  it('takes an amount off, or sets a price, only on the type it is for, and never below nothing', async () => {
    const off = await promotion({ effect: 'amount_off', value: 1000, targets: [{ role: 'applies', kind: TICKETS, scope: { ticketTypeId: h.concessionId } }] })
    expect(total(await hold(h, off.code, 1, 1))).toBe(1200 + 0)
    const set = await promotion({ effect: 'set_price', value: 500 })
    expect(total(await hold(h, set.code, 1, 1))).toBe(500 + 500)
  })

  it('discounts only as many tickets as it allows in one sale, the dearest first', async () => {
    const p = await promotion({ effect: 'amount_off', value: 200, maxPerSale: 1 })
    expect(total(await hold(h, p.code, 1, 2))).toBe(1000 + 800 + 800)
    expect(await used(p.id)).toBe(1)
  })

  it('runs a multi-buy: the cheapest in each group free, or the group at one price', async () => {
    const free = await promotion({ effect: 'multi_buy', value: 0, buyQuantity: 3, freeQuantity: 1 })
    const b = await hold(h, free.code, 2, 1)
    expect(total(b)).toBe(1200 + 1200)
    // The concession given free is shared over the group, so a split payment keeps each line's price.
    const each = await lines((b as { orderId: string }).orderId)
    expect(each.reduce((s, l) => s + l.discount_minor, 0)).toBe(800)
    expect(each.every(l => l.discount_minor > 0)).toBe(true)
    // Two groups need six tickets; with four, one group is priced and the fourth is not.
    expect(total(await hold(h, free.code, 4))).toBe(1200 * 3)
    const priced = await promotion({ effect: 'multi_buy', value: 2000, buyQuantity: 2 })
    expect(total(await hold(h, priced.code, 2))).toBe(2000)
  })

  it('takes an amount off the whole sale over a smallest spend, shared across the tickets by price', async () => {
    const p = await promotion({ effect: 'basket_amount_off', value: 500, minSpendMinor: 2500 })
    expect(await hold(h, p.code, 2)).toEqual({ ok: false, code: 'promotions.code.no-items' })
    const b = await hold(h, p.code, 2, 1)
    expect(total(b)).toBe(3200 - 500)
    const each = await lines((b as { orderId: string }).orderId)
    expect(each.map(l => l.discount_minor).sort((x, y) => y - x)).toEqual([188, 187, 125])
    expect(await used(p.id)).toBe(1)
  })

  it('applies on its own where it is set to, with no code', async () => {
    const other = await house(10)
    const p = await promotion({ targets: [{ role: 'applies', kind: TICKETS, scope: { productionId: other.productionId } }] }, true)
    expect(total(await hold(other, undefined, 1))).toBe(1080)
    expect(total(await hold(h, undefined, 1))).toBe(1200)
    expect((await api('POST', `/api/promotions/${p.id}/active`, { active: false })).status).toBe(200)
    expect(total(await hold(other, undefined, 1))).toBe(1200)
  })

  it('gives its last use once, and refuses a second buyer', async () => {
    const p = await promotion({ value: 10000, maxUses: 1 })
    const [a, b] = await Promise.all([hold(h, p.code, 1), hold(h, p.code, 1)])
    expect([a, b].filter(r => r.ok)).toHaveLength(1)
    expect([a, b].find(r => !r.ok)).toMatchObject({ code: 'promotions.code.used-up' })
    expect(await used(p.id)).toBe(1)
    expect((await api('GET', `/api/box-office/book/performances/${h.performanceId}/promo?code=${p.code}`, undefined, undefined)).body.code).toBe('promotions.code.used-up')
  })

  it('gives its uses back when the basket lapses, the next time it is used', async () => {
    const p = await promotion({ value: 5000, maxUses: 2 })
    const b = await hold(h, p.code, 2)
    expect(await used(p.id)).toBe(2)
    advanceClock(86_400_000)
    await inContext(async () => {
      const unit = createUnit()
      expireBasket(unit.view(), (b as { orderId: string }).orderId)
      await unit.commit()
    })
    expect((await hold(h, p.code, 2)).ok).toBe(true)
    expect(await used(p.id)).toBe(2)
    expect(await rows('SELECT state, count(*) AS n FROM promotions_redemptions WHERE promotion_id = ? GROUP BY state ORDER BY state', p.id)).toEqual([{ state: 'live', n: 2 }, { state: 'released', n: 2 }])
  })

  it('is refused when unknown, retired, not yet valid, past its end, for elsewhere or for nothing chosen', async () => {
    expect(await hold(h, 'NOSUCHCODE', 1)).toMatchObject({ code: 'promotions.code.unknown' })
    const retired = await promotion({})
    expect((await api('POST', `/api/promotions/${retired.id}/active`, { active: false })).status).toBe(200)
    expect(await hold(h, retired.code, 1)).toMatchObject({ code: 'promotions.code.expired' })
    const later = await promotion({ validFrom: nowMs() + 86_400_000 })
    expect(await hold(h, later.code, 1)).toMatchObject({ code: 'promotions.code.not-yet' })
    const ending = await promotion({ validUntil: nowMs() + 60_000 })
    expect((await hold(h, ending.code, 1)).ok).toBe(true)
    advanceClock(120_000)
    expect(await hold(h, ending.code, 1)).toMatchObject({ code: 'promotions.code.expired' })
    const tillOnly = await promotion({ channel: 'till' })
    expect(await hold(h, tillOnly.code, 1)).toMatchObject({ code: 'promotions.code.not-here' })
    const other = await house(10)
    const elsewhere = await promotion({ targets: [{ role: 'applies', kind: TICKETS, scope: { productionId: other.productionId } }] })
    expect(await hold(h, elsewhere.code, 1)).toMatchObject({ code: 'promotions.code.no-items' })
  })

  it('set "not with member or concession prices", leaves alone the prices already reduced', async () => {
    const p = await promotion({ value: 2000, notWithRequirements: true })
    expect(total(await hold(h, p.code, 1, 1))).toBe(960 + 800)
    expect(await hold(h, p.code, 0, 2)).toEqual({ ok: false, code: 'promotions.code.no-items' })
    const preview = await api('GET', `/api/box-office/book/performances/${h.performanceId}/promo?code=${p.code}`, undefined, undefined)
    expect(preview.body.prices.some((x: { ticketTypeId: string }) => x.ticketTypeId === h.concessionId)).toBe(false)
    expect(preview.body.prices).toEqual(expect.arrayContaining([{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 960 }]))
  })

  it('is previewed for a buyer with the prices it gives', async () => {
    const p = await promotion({ effect: 'amount_off', value: 300, maxPerSale: 2 })
    const preview = await api('GET', `/api/box-office/book/performances/${h.performanceId}/promo?code=${p.code.toLowerCase()}`, undefined, undefined)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body).toMatchObject({ code: p.code, effect: 'amount_off', maxPerOrder: 2 })
    expect(preview.body.prices).toEqual(expect.arrayContaining([
      { bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 900 },
      { bandId: h.bandId, ticketTypeId: h.concessionId, amountMinor: 500 },
    ]))
  })
})

describe('days and times', () => {
  it('runs a code only in its windows of the week, in the theatre\'s time zone', async () => {
    // 16 November 2026 is a Monday; noon in London.
    const p = await promotion({ value: 5000, schedule: [{ days: [1], from: '17:00', until: '19:00' }] })
    expect(await hold(h, p.code, 1)).toEqual({ ok: false, code: 'promotions.code.not-now' })
    try {
      setClock(NOV_16 + 5.5 * 3600_000) // 17:30
      expect(total(await hold(h, p.code, 1))).toBe(600)
      setClock(NOV_16 + 7 * 3600_000) // 19:00, when it has ended
      expect(await hold(h, p.code, 1)).toEqual({ ok: false, code: 'promotions.code.not-now' })
    }
    finally {
      setClock(NOV_16)
    }
    const listed = (await api('GET', '/api/promotions')).body.rows.find((r: any) => r.id === p.id)
    expect(listed.schedule).toEqual([{ days: [1], from: '17:00', until: '19:00' }])
  })

  it('leaves an automatic promotion out of its hours, and refuses a window it cannot read', async () => {
    const auto = await promotion({ value: 1000, schedule: [{ days: [2, 3], from: '12:00', until: '13:00' }] }, true)
    expect(total(await hold(h, undefined, 1))).toBe(1200)
    expect(await used(auto.id)).toBe(0)
    await api('POST', `/api/promotions/${auto.id}/active`, { active: false })
    const bad = await api('POST', '/api/promotions', body('BADTIME1', { schedule: [{ days: [1], from: '25:00', until: '19:00' }] }))
    expect(bad.status).toBe(422)
  })
})

describe('managing promotions', () => {
  it('keeps codes unique whatever the case, and will not lower the uses below those made', async () => {
    const p = await promotion({})
    expect((await api('POST', '/api/promotions', body(p.code.toLowerCase(), {}))).status).toBe(409)
    await hold(h, p.code, 3)
    const listed = (await api('GET', '/api/promotions')).body.rows.find((r: { id: string }) => r.id === p.id)
    const lowered = await api('PUT', `/api/promotions/${p.id}`, { ...body(p.code, {}), codes: [{ id: listed.codes[0].id, code: p.code }], maxUses: 2 })
    expect(lowered.body.code).toBe('promotions.promotion.below-used')
    expect((await api('GET', '/api/promotions')).body.rows.find((r: { id: string }) => r.id === p.id)).toMatchObject({ used: 3, active: true, codes: [expect.objectContaining({ code: p.code, used: 3 })] })
  })

  it('offers the kinds the selling modules describe, and narrows tickets to one performance and section', async () => {
    const listed = await api('GET', '/api/promotions')
    const tickets = listed.body.kinds.find((k: { kind: string }) => k.kind === TICKETS)
    expect(tickets.fields.map((f: { id: string }) => f.id)).toEqual(['productionId', 'performanceId', 'bandId', 'ticketTypeId'])
    expect(tickets.fields[1].options).toEqual(expect.arrayContaining([expect.objectContaining({ value: h.performanceId, parent: h.productionId })]))
    const p = await promotion({ effect: 'amount_off', value: 100, targets: [{ role: 'applies', kind: TICKETS, scope: { performanceId: h.performanceId, bandId: h.bandId } }] })
    const saved = (await api('GET', '/api/promotions')).body.rows.find((r: { id: string }) => r.id === p.id)
    // A section is its production's, so the promotion is for that production too.
    expect(saved.targets[0]).toMatchObject({ role: 'applies', kind: TICKETS, scope: { productionId: h.productionId, performanceId: h.performanceId, bandId: h.bandId }, words: expect.any(String) })
    expect(total(await hold(h, p.code, 1))).toBe(1100)
    const other = await house(5)
    const wrong = await api('POST', '/api/promotions', body(`TEST${++made}`, { targets: [{ role: 'applies', kind: TICKETS, scope: { productionId: other.productionId, bandId: h.bandId } }] }))
    expect(wrong.body.code).toBe('box-office.promotion.scope')
    expect((await api('POST', '/api/promotions', body(`TEST${++made}`, { targets: [{ role: 'applies', kind: 'nothing.here' }] }))).body.code).toBe('promotions.promotion.kind')
  })

  it('is closed to someone who does not manage promotions', async () => {
    expect((await api('GET', '/api/promotions', undefined, person([]))).status).toBe(403)
  })
})
