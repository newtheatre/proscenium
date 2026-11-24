// VAT on bar sales (BAR-60): a product's tax code, or the theatre's usual one, is applied to its
// VAT-inclusive price when the sale posts, and comes back off with a refund. Unregistered, no codes.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { taxTotals } from '../../../finance/server/tax'
import { ensureSystemAccounts } from '../../../finance/server/ledger'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { attest, confirmRefund, openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import saleGet from '../../server/api/bar/sales/[reference]/index.get'
import refundPost from '../../server/api/bar/sales/[reference]/refund.post'
import salesGet from '../../server/api/bar/sales/index.get'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'
import productPatch from '../../server/api/bar/products/[id]/index.patch'

const NOW = Date.UTC(2026, 10, 17, 21) // not-policy: a test's moment
const handle = server({
  'POST /api/payments/till/sale': tillSalePost,
  'GET /api/bar/sales': salesGet,
  'GET /api/bar/sales/:reference': saleGet,
  'POST /api/bar/sales/:reference/refund': refundPost,
  'PATCH /api/bar/products/:id': productPatch,
})
const seller = person(['payments.session.open', 'payments.attempt.attest', 'bar.sale.sell'], { reassertedAt: NOW })
const manager = person(['bar.sale.refund', 'payments.session.open', 'bar.product.manage'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function send(method: string, path: string, body: unknown, actor = manager) {
  const response = await call(handle, method, path, { actor, body: method === 'GET' ? undefined : body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const setSetting = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key as never, value, { reason: 'test', confirm: true }))

const cash = newId('ppa')
const stock = { outlet: '', ale: '', nuts: '', reason: '', declineReason: '' }
const balance = async (key: string) => (await rows<{ total: number | null }>('SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.total ?? 0
const income = async () => (await rows<{ total: number | null }>("SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'bar.income'"))[0]!.total ?? 0
let reference = ''
let lines: { id: string, label: string }[] = []
const ids = { nutsProduct: '' }

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOW, NOW).run()
  await commit(async unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit(async (unit) => {
    const v = unit.view()
    const categoryId = addCategory(v, { name: 'VAT ale' })
    stock.ale = (await addProduct(v, { categoryId, name: 'VAT bitter' }, { name: 'Pint', amountMinor: 500 }, seller.accountId!)).variantId
    const nuts = await addProduct(v, { categoryId, name: 'VAT nuts' }, { amountMinor: 200 }, seller.accountId!)
    stock.nuts = nuts.variantId
    ids.nutsProduct = nuts.productId
    stock.outlet = addOutlet(v, { name: 'VAT bar', kind: 'bar' })
  })
  await env.DB.prepare("UPDATE payments_provider_accounts SET active = ? WHERE provider = 'cash'").bind(1).run()
  await setSetting('core.locale.time-zone', 'Europe/London')
  await setSetting('payments.refunds.self-approve-up-to', 600)
  for (const who of [seller, manager]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
  await commit(unit => ensureSystemAccounts(unit.view(), 'bar'))
  await inContext(() => ensureVocabularies())
  stock.reason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'bar.refund-reason' AND slug = 'faulty'"))[0]!.id
  stock.declineReason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'payments.refund-decline-reason' LIMIT 1"))[0]!.id

  await commit(unit => ensureSystemAccounts(unit.view(), 'finance'))
})

async function sell(key: string): Promise<string> {
  const sold = await send('POST', '/api/payments/till/sale', { panels: [{ basket: 'bar', input: { outletId: stock.outlet, clientKey: key, lines: [{ variantId: stock.ale, quantity: 2 }, { variantId: stock.nuts, quantity: 2 }], expectedTotalMinor: 1400 } }] }, seller)
  expect(sold.status, JSON.stringify(sold.body)).toBe(200)
  await inContext(() => attest({ intentId: sold.body.intentId, providerAccountId: cash, method: 'cash' }), seller)
  const ref = (await rows<{ reference: string }>('SELECT reference FROM bar_sales WHERE client_key = ?', key))[0]!.reference
  lines = (await send('GET', `/api/bar/sales/${ref}`, undefined)).body.sale.lines
  return ref
}
const line = (label: string) => lines.find(l => l.label === label)!.id
const codes = () => rows<{ tax_code: string }>("SELECT DISTINCT e.tax_code FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id WHERE p.source_module = 'payments'")

describe('VAT on bar sales', () => {
  it('records no tax code while the theatre is not registered', async () => {
    await sell('vat-0-xxxxxxxxxx')
    expect(await codes()).toEqual([{ tax_code: 'none' }])
    expect(await balance('finance.vat-output')).toBe(0)
  })

  it('takes a product\'s own code or the usual one, splitting the VAT out of the price', async () => {
    await setSetting('finance.tax.number', 'GB123456789')
    await setSetting('finance.tax.registered', true)
    expect((await send('PATCH', `/api/bar/products/${ids.nutsProduct}`, { taxCode: 'zero' })).status).toBe(200)
    expect((await send('PATCH', `/api/bar/products/${ids.nutsProduct}`, { taxCode: 'luxury' })).body.code).toBe('bar.product.tax-code')
    const before = await income()
    reference = await sell('vat-1-xxxxxxxxxx')
    // Two pints at 500 at the usual 20%: 1000 with 167 VAT. Two bags of nuts at 200, zero rated.
    expect(await balance('finance.vat-output')).toBe(-167)
    expect(await income() - before).toBe(-(833 + 400))
    const entries = await rows<{ tax_code: string, tax_minor: number, amount_minor: number }>(
      "SELECT e.tax_code, e.tax_minor, e.amount_minor FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'bar.income' AND e.tax_code <> 'none' ORDER BY e.tax_code")
    expect(entries).toEqual([{ tax_code: 'standard', tax_minor: -167, amount_minor: -833 }, { tax_code: 'zero', tax_minor: 0, amount_minor: -400 }])
  })

  it('takes the VAT back off with a refund, at the line\'s code', async () => {
    const asked = await send('POST', `/api/bar/sales/${reference}/refund`, { reasonTermId: stock.reason, stockOutcome: 'returned', lines: [{ lineId: line('VAT bitter, Pint'), quantity: 1 }], expectedTotalMinor: 500 })
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    await commit(unit => confirmRefund(unit.view(), asked.body.refundId, manager.accountId!))
    expect(await balance('finance.vat-output')).toBe(-167 + 83)
  })

  it('gives taxTotals the sales by code for a return', async () => {
    const totals = await inContext(() => taxTotals({ startsAt: NOW - 86_400_000, endsAt: NOW + 86_400_000 }))
    const standard = totals.filter(t => t.taxCode === 'standard')
    expect(standard.find(t => t.vatAccount === 'output')?.amountMinor).toBe(-84)
    expect(standard.find(t => t.accountKind === 'income' && !t.vatAccount)).toMatchObject({ amountMinor: -833 + 417, taxMinor: -167 + 83 })
  })
})
