// Promotions on bar products (the unified promotions design, the bar slice): the bar's panel offers
// its lines to the till, which prices them with the rest of the sale; each line keeps its saving and
// the use behind it, the sale's total and the bar's income are what was paid, and a use on a payment
// that did not complete is given back.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { attest, cancelIntent, openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import tillSummaryPost from '../../../payments/server/api/payments/till/summary.post'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'
import { createPromotion } from '../../../promotions/server/promotions'

const NOW = Date.UTC(2026, 10, 18, 19) // not-policy: a test's moment
const handle = server({
  'POST /api/payments/till/sale': tillSalePost,
  'POST /api/payments/till/summary': tillSummaryPost,
})
const seller = person(['payments.session.open', 'payments.attempt.attest', 'bar.sale.sell'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function post(path: string, body: unknown) {
  const response = await call(handle, 'POST', path, { actor: seller, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}

const cash = newId('ppa')
const bar = { outlet: '', other: '', pint: '', crisps: '', lager: '' }
const basket = (key: string, lines: [string, number][], expectedTotalMinor: number, outletId = bar.outlet) => ({ outletId, clientKey: key, lines: lines.map(([variantId, quantity]) => ({ variantId, quantity })), expectedTotalMinor, ageCheck: 'id_checked' })
const sell = (input: Record<string, unknown>, codes: string[]) => post('/api/payments/till/sale', { panels: [{ basket: 'bar', input }], pricing: { codes } })
const code = (name: string, scope: Record<string, string>, extra: Record<string, unknown> = {}) =>
  commit(unit => createPromotion(unit.view(), { name, label: name, trigger: 'code', effect: 'percent_off', value: 1000, codes: [{ code: name }], targets: [{ role: 'applies', kind: 'bar.item', scope }], ...extra }, null))
const lines = (key: string) => rows<{ quantity: number, unit_minor: number, discount_minor: number, amount_minor: number, promotion_redemption_id: string | null }>(
  'SELECT l.quantity, l.unit_minor, l.discount_minor, l.amount_minor, l.promotion_redemption_id FROM bar_sale_lines l JOIN bar_sales s ON s.id = l.sale_id WHERE s.client_key = ? ORDER BY l.unit_minor DESC', key)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar', 'promotions']) await setModule(id, true)
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOW, NOW).run()
  await commit(async (unit) => {
    await standardListener({ payload: { moduleId: 'finance' } } as any, unit.view())
    await standardListener({ payload: { moduleId: 'bar' } } as any, unit.view())
  })
  await commit(async (unit) => {
    const v = unit.view()
    const categoryId = addCategory(v, { name: 'Offer draught' })
    const made = await addProduct(v, { categoryId, name: 'Offer lager', ageRestricted: true }, { name: 'Pint', amountMinor: 450 }, seller.accountId!)
    bar.pint = made.variantId
    bar.lager = made.productId
    bar.crisps = (await addProduct(v, { categoryId, name: 'Offer crisps' }, { amountMinor: 120 }, seller.accountId!)).variantId
    bar.outlet = addOutlet(v, { name: 'Offer bar', kind: 'bar' })
    bar.other = addOutlet(v, { name: 'Offer kiosk', kind: 'bar' })
  })
  await env.DB.prepare("UPDATE payments_provider_accounts SET active = ? WHERE provider = 'cash'").bind(1).run()
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
  const { ensureSystemAccounts } = await import('../../../finance/server/ledger')
  await commit(unit => ensureSystemAccounts(unit.view(), 'bar'))
})

describe('promotions on bar products', () => {
  it('takes a code off the product it names, keeps the saving on the line and posts what was paid', async () => {
    await code('LAGER10', { productId: bar.lager })
    const input = basket('offer-1-xxxxxxx', [[bar.pint, 2], [bar.crisps, 1]], 1020)
    const summary = await post('/api/payments/till/summary', { panels: [{ basket: 'bar', input }], pricing: { codes: ['lager10'] } })
    expect(summary.body, JSON.stringify(summary.body)).toMatchObject({
      amountMinor: 810 + 120,
      savings: [{ code: 'LAGER10', amountMinor: 90 }],
      panels: [{ lines: [{ label: '2 × Offer lager, Pint', amountMinor: 810 }, { label: 'Offer crisps', amountMinor: 120 }] }],
    })

    const made = await sell(input, ['LAGER10'])
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.amountMinor).toBe(930)
    const [pint, crisps] = await lines('offer-1-xxxxxxx')
    expect(pint).toMatchObject({ quantity: 2, unit_minor: 450, discount_minor: 90, amount_minor: 810 })
    expect(pint!.promotion_redemption_id).toBeTruthy()
    expect(crisps).toMatchObject({ discount_minor: 0, amount_minor: 120, promotion_redemption_id: null })
    const [use] = await rows<{ kind: string, ref: string, state: string }>('SELECT kind, ref, state FROM promotions_redemptions WHERE id = ?', pint!.promotion_redemption_id)
    expect(use).toMatchObject({ kind: 'bar.item', state: 'live' })

    const income = async () => (await rows<{ total: number | null }>("SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'bar.income'"))[0]!.total ?? 0
    const before = await income()
    expect(await inContext(() => attest({ intentId: made.body.intentId, providerAccountId: cash, method: 'cash' }), seller)).toMatchObject({ settled: true })
    expect(await income()).toBe(before - 930)
  })

  it('refuses a code narrowed to another outlet, or to nothing in the basket', async () => {
    await code('KIOSK10', { outletId: bar.other })
    expect((await sell(basket('offer-2-xxxxxxx', [[bar.crisps, 1]], 120), ['KIOSK10'])).body.code).toBe('promotions.code.no-items')
    const there = await sell(basket('offer-3-xxxxxxx', [[bar.crisps, 2]], 240, bar.other), ['KIOSK10'])
    expect(there.status, JSON.stringify(there.body)).toBe(200)
    expect(there.body.amountMinor).toBe(216)
  })

  it('gives the use back when the payment does not complete', async () => {
    await code('ONCE', { productId: bar.lager }, { maxUses: 1, effect: 'amount_off', value: 100 })
    const key = 'offer-4-xxxxxxx'
    const first = await sell(basket(key, [[bar.pint, 1]], 450), ['ONCE'])
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.amountMinor).toBe(350)
    expect((await sell(basket('offer-5-xxxxxxx', [[bar.pint, 1]], 450), ['ONCE'])).body.code).toBe('promotions.code.used-up')

    await commit(unit => cancelIntent(unit.view(), first.body.intentId))
    const again = await sell(basket(key, [[bar.pint, 1]], 450), ['ONCE'])
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body.amountMinor).toBe(350)
    expect(await rows('SELECT state, count(*) AS n FROM promotions_redemptions WHERE sale_ref = (SELECT id FROM bar_sales WHERE client_key = ?) GROUP BY state ORDER BY state', key))
      .toEqual([{ state: 'live', n: 1 }, { state: 'released', n: 1 }])
  })
})
