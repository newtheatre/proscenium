// Selling through the till (BAR-10 to BAR-12, BAR-22; tests T-I5 to T-I7, T-I17): the bar's panel
// writes a bar sale awaiting payment in the intent's batch, the money marks it paid and posts bar
// income in Payments' batch, a payment that does not complete leaves it open to try again, and
// closing an opening voids what is unpaid but waits for a payment in hand.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { attest, cancelIntent, openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import tillSummaryPost from '../../../payments/server/api/payments/till/summary.post'
import closePost from '../../server/api/bar/openings/[id]/close.post'
import salesGet from '../../server/api/bar/sales/index.get'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addPriceList, addProduct } from '../../server/catalogue'

const NOW = Date.UTC(2026, 10, 17, 19) // not-policy: a test's moment
const handle = server({
  'POST /api/payments/till/sale': tillSalePost,
  'POST /api/payments/till/summary': tillSummaryPost,
  'POST /api/bar/openings/:id/close': closePost,
  'GET /api/bar/sales': salesGet,
})
const seller = person(['payments.session.open', 'payments.attempt.attest', 'bar.sale.sell', 'bar.opening.manage'], { reassertedAt: NOW })
const onlooker = person(['payments.session.open'])
// Reads bar sales; one may also close an outlet, the other may not.
const closer = person(['bar.sale.view', 'bar.opening.manage'], { reassertedAt: NOW })
const reader = person(['bar.sale.view'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function post(path: string, body: unknown, actor = seller) {
  const response = await call(handle, 'POST', path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const till = (input: Record<string, unknown>, actor = seller) => post('/api/payments/till/sale', { panels: [{ basket: 'bar', input }] }, actor)

const cash = newId('ppa')
const stock = { outlet: '', pint: '', crisps: '' }
const income = async () => (await rows<{ total: number | null }>("SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'bar.income'"))[0]!.total ?? 0
const sale = async (key: string) => (await rows<{ id: string, state: string, total_minor: number, opening_id: string, reference: string }>('SELECT id, state, total_minor, opening_id, reference FROM bar_sales WHERE client_key = ?', key))[0]
const basket = (key: string, lines: [string, number][], expectedTotalMinor: number) => ({ outletId: stock.outlet, clientKey: key, lines: lines.map(([variantId, quantity]) => ({ variantId, quantity })), expectedTotalMinor, ageCheck: 'id_checked' })

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOW, NOW).run()
  await commit(async (unit) => {
    await standardListener({ payload: { moduleId: 'finance' } } as any, unit.view())
    await standardListener({ payload: { moduleId: 'bar' } } as any, unit.view())
  })
  await commit(async (unit) => {
    const v = unit.view()
    const categoryId = addCategory(v, { name: 'Selling draught' })
    stock.pint = (await addProduct(v, { categoryId, name: 'Selling lager', ageRestricted: true }, { name: 'Pint', amountMinor: 450 }, seller.accountId!)).variantId
    stock.crisps = (await addProduct(v, { categoryId, name: 'Selling crisps' }, { amountMinor: 120 }, seller.accountId!)).variantId
    stock.outlet = addOutlet(v, { name: 'Selling bar', kind: 'bar' })
  })
  await env.DB.prepare("UPDATE payments_provider_accounts SET active = ? WHERE provider = 'cash'").bind(1).run()
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  for (const who of [seller, onlooker]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
  // Finance makes bar.income when the bar is switched on.
  const { ensureSystemAccounts } = await import('../../../finance/server/ledger')
  await commit(unit => ensureSystemAccounts(unit.view(), 'bar'))
})

describe('selling drinks in the till', () => {
  it('adds up the basket at today\'s prices, naming each line', async () => {
    const answer = await post('/api/payments/till/summary', { panels: [{ basket: 'bar', input: basket('sum-1-xxxxxxxx', [[stock.pint, 2], [stock.crisps, 1]], 1020) }] })
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    expect(answer.body).toMatchObject({ amountMinor: 1020, panels: [{ basket: 'bar', lines: [{ label: '2 × Selling lager, Pint', amountMinor: 900 }, { label: 'Selling crisps', amountMinor: 120 }] }] })
  })

  it('takes one payment, marks the sale paid and posts bar income in the same batch', async () => {
    const key = 'paid-1-xxxxxxxx'
    expect((await till(basket(key, [[stock.pint, 1]], 400))).body.code).toBe('bar.sale.total-changed')
    expect((await till(basket(key, [[stock.pint, 1]], 450), onlooker)).status).toBe(403)

    const before = await income()
    const made = await till(basket(key, [[stock.pint, 1], [stock.crisps, 2]], 690))
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(await sale(key)).toMatchObject({ state: 'awaiting_payment', total_minor: 690 })
    expect((await sale(key))!.reference).toMatch(/^B-[2-9A-Z]{5}$/)
    expect(await rows("SELECT count(*) AS n FROM bar_openings WHERE outlet_id = ? AND state = 'open'", stock.outlet)).toEqual([{ n: 1 }])

    expect(await inContext(() => attest({ intentId: made.body.intentId, providerAccountId: cash, method: 'cash' }), seller)).toMatchObject({ settled: true })
    expect(await sale(key)).toMatchObject({ state: 'paid' })
    expect(await income()).toBe(before - 690)
    // The same basket cannot be paid for twice.
    expect((await till(basket(key, [[stock.pint, 1], [stock.crisps, 2]], 690))).body.code).toBe('bar.sale.not-open')
  })

  it('leaves the sale open when the payment is cancelled, and pays the same sale on the next try', async () => {
    const key = 'retry-1-xxxxxxx'
    const first = await till(basket(key, [[stock.crisps, 1]], 120))
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    await commit(unit => cancelIntent(unit.view(), first.body.intentId))
    const opened = await sale(key)
    expect(opened).toMatchObject({ state: 'open', total_minor: 120 })

    const second = await till(basket(key, [[stock.crisps, 3]], 360))
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    expect(await sale(key)).toMatchObject({ id: opened!.id, state: 'awaiting_payment', total_minor: 360 })
    expect(await rows('SELECT quantity FROM bar_sale_lines WHERE sale_id = ?', opened!.id)).toEqual([{ quantity: 3 }])
  })

  it('refuses to close while a payment is in hand, then closes and voids what is unpaid', async () => {
    const waiting = await sale('retry-1-xxxxxxx')
    const refused = await post(`/api/bar/openings/${waiting!.opening_id}/close`, {})
    expect(refused.body.code).toBe('bar.opening.payment-waiting')

    const intent = (await rows<{ intent_id: string }>('SELECT intent_id FROM bar_sales WHERE id = ?', waiting!.id))[0]!.intent_id
    await commit(unit => cancelIntent(unit.view(), intent))
    const closed = await post(`/api/bar/openings/${waiting!.opening_id}/close`, {})
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(await sale('retry-1-xxxxxxx')).toMatchObject({ state: 'void' })
    expect(await sale('paid-1-xxxxxxxx')).toMatchObject({ state: 'paid' })

    // The next sale opens the outlet again.
    const next = await till(basket('after-1-xxxxxxx', [[stock.crisps, 1]], 120))
    expect(next.status, JSON.stringify(next.body)).toBe(200)
    expect((await sale('after-1-xxxxxxx'))!.opening_id).not.toBe(waiting!.opening_id)
  })

  it('lists openings beside the sales for someone who may close one, and the sales of one opening', async () => {
    const get = async (path: string, actor: typeof closer) => {
      const response = await call(handle, 'GET', path, { actor })
      return { status: response.status, body: await response.json() as any }
    }
    const closed = (await sale('retry-1-xxxxxxx'))!.opening_id
    const open = (await sale('after-1-xxxxxxx'))!.opening_id
    const all = await get('/api/bar/sales', closer)
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    // What is trading comes first, with what it has taken.
    const mine = all.body.openings.filter((o: any) => o.outletId === stock.outlet)
    expect(mine.map((o: any) => [o.id, o.state])).toEqual([[open, 'open'], [closed, 'closed']])
    expect(mine[1]).toMatchObject({ sales: 1, unpaid: 0, waiting: 0 })

    const one = await get(`/api/bar/sales?opening=${closed}`, closer)
    expect(one.body.rows.map((r: any) => r.reference).sort()).toEqual([(await sale('paid-1-xxxxxxxx'))!.reference, (await sale('retry-1-xxxxxxx'))!.reference].sort())
    // Someone who only reads sales is told nothing about openings.
    expect((await get('/api/bar/sales', reader)).body.openings).toEqual([])
  })

  it('keeps lines unchangeable once a sale has left open', async () => {
    const paid = await sale('paid-1-xxxxxxxx')
    await expect(env.DB.prepare('UPDATE bar_sale_lines SET quantity = 9, amount_minor = 4050 WHERE sale_id = ?').bind(paid!.id).run()).rejects.toThrow(/only while the sale is open/)
    await expect(env.DB.prepare("UPDATE bar_sales SET state = 'open' WHERE id = ?").bind(paid!.id).run()).rejects.toThrow(/life cycle/)
  })
})

describe('a restricted price list', () => {
  it('is sold from only by someone allowed to use it (T-I11)', async () => {
    const committee = person(['payments.session.open', 'bar.sale.sell', 'bar.sale.use-restricted-price-list'], { reassertedAt: NOW })
    await commit(unit => openSession(unit.view(), { accountId: committee.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
    const outlet = await commit(async (unit) => {
      const v = unit.view()
      return addOutlet(v, { name: 'Committee bar', kind: 'bar', priceListId: addPriceList(v, { name: 'Committee', restricted: true }) })
    })
    const input = (key: string) => ({ outletId: outlet, clientKey: key, lines: [{ variantId: stock.crisps, quantity: 1 }], expectedTotalMinor: 120 })
    expect((await till(input('committee-1-xxxx'))).status).toBe(403)
    const allowed = await till(input('committee-2-xxxx'), committee)
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
  })
})
