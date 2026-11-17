// Refunding a paid bar sale (BAR-19; tests T-I14, T-N5, T-N6): asking writes reversals that hold the
// line, income moves only when the money has gone back, a declined refund lets go of what it held, and
// nothing can be refunded past what was sold.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { attest, confirmRefund, declineRefund, openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import saleGet from '../../server/api/bar/sales/[reference]/index.get'
import refundPost from '../../server/api/bar/sales/[reference]/refund.post'
import salesGet from '../../server/api/bar/sales/index.get'
import standardListener from '../../server/listeners/standard-price-list'
import refundFailed from '../../server/listeners/refund-failed'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'

const NOW = Date.UTC(2026, 10, 17, 21) // not-policy: a test's moment
const handle = server({
  'POST /api/payments/till/sale': tillSalePost,
  'GET /api/bar/sales': salesGet,
  'GET /api/bar/sales/:reference': saleGet,
  'POST /api/bar/sales/:reference/refund': refundPost,
})
const seller = person(['payments.session.open', 'payments.attempt.attest', 'bar.sale.sell'], { reassertedAt: NOW })
const manager = person(['bar.sale.refund', 'payments.session.open'], { reassertedAt: NOW })

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
const income = async () => (await rows<{ total: number | null }>("SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'bar.income'"))[0]!.total ?? 0
let reference = ''
let lines: { id: string, label: string }[] = []

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOW, NOW).run()
  await commit(async unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit(async (unit) => {
    const v = unit.view()
    const categoryId = addCategory(v, { name: 'Refunds ale' })
    stock.ale = (await addProduct(v, { categoryId, name: 'Refunds bitter' }, { name: 'Pint', amountMinor: 500 }, seller.accountId!)).variantId
    stock.nuts = (await addProduct(v, { categoryId, name: 'Refunds nuts' }, { amountMinor: 200 }, seller.accountId!)).variantId
    stock.outlet = addOutlet(v, { name: 'Refunds bar', kind: 'bar' })
  })
  await setSetting('payments.cash.enabled', true)
  await setSetting('core.locale.time-zone', 'Europe/London')
  await setSetting('payments.refunds.self-approve-up-to', 600)
  for (const who of [seller, manager]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
  const { ensureSystemAccounts } = await import('../../../finance/server/ledger')
  await commit(unit => ensureSystemAccounts(unit.view(), 'bar'))
  await inContext(() => ensureVocabularies())
  stock.reason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'bar.refund-reason' AND slug = 'faulty'"))[0]!.id
  stock.declineReason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'payments.refund-decline-reason' LIMIT 1"))[0]!.id

  // Two pints and two bags of nuts, paid in cash.
  const sold = await send('POST', '/api/payments/till/sale', { panels: [{ basket: 'bar', input: { outletId: stock.outlet, clientKey: 'refund-1-xxxxxxx', lines: [{ variantId: stock.ale, quantity: 2 }, { variantId: stock.nuts, quantity: 2 }], expectedTotalMinor: 1400 } }] }, seller)
  expect(sold.status, JSON.stringify(sold.body)).toBe(200)
  await inContext(() => attest({ intentId: sold.body.intentId, providerAccountId: cash, method: 'cash' }), seller)
  reference = (await rows<{ reference: string }>("SELECT reference FROM bar_sales WHERE client_key = 'refund-1-xxxxxxx'"))[0]!.reference
  lines = (await send('GET', `/api/bar/sales/${reference}`, undefined)).body.sale.lines
})

const line = (label: string) => lines.find(l => l.label === label)!.id
const refund = (body: Record<string, unknown>, actor = manager) => send('POST', `/api/bar/sales/${reference}/refund`, { reasonTermId: stock.reason, stockOutcome: 'returned', ...body }, actor)
const reversals = () => rows<{ state: string, quantity: number, amount_minor: number }>('SELECT state, quantity, amount_minor FROM bar_sale_reversals ORDER BY created_at, id')

describe('refunding a bar sale', () => {
  it('lists the sale and shows its lines', async () => {
    const found = await send('GET', `/api/bar/sales?q=${reference.slice(2)}`, undefined)
    expect(found.body.rows).toMatchObject([{ reference, totalMinor: 1400, state: 'paid', items: 4 }])
    expect(lines.map(l => l.label).sort()).toEqual(['Refunds bitter, Pint', 'Refunds nuts'])
  })

  it('refuses someone who may not refund, a changed total and a reason off the list', async () => {
    expect((await refund({ lines: [{ lineId: line('Refunds nuts'), quantity: 1 }], expectedTotalMinor: 200 }, seller)).status).toBe(403)
    expect((await refund({ lines: [{ lineId: line('Refunds nuts'), quantity: 1 }], expectedTotalMinor: 150 })).body.code).toBe('bar.refund.total-changed')
    expect((await refund({ lines: [{ lineId: line('Refunds nuts'), quantity: 1 }], expectedTotalMinor: 200, reasonTermId: 'trm_nope' })).body.code).toBe('bar.refund.bad-reason')
    expect(await reversals()).toEqual([])
  })

  it('holds the line at request and moves income only when the money has gone back (T-I14)', async () => {
    const before = await income()
    const asked = await refund({ lines: [{ lineId: line('Refunds bitter, Pint'), quantity: 1 }], expectedTotalMinor: 500 })
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(asked.body).toMatchObject({ state: 'approved', amountMinor: 500 })
    expect(await reversals()).toEqual([{ state: 'requested', quantity: 1, amount_minor: 500 }])
    expect(await income()).toBe(before)

    await commit(unit => confirmRefund(unit.view(), asked.body.refundId, manager.accountId!))
    expect(await reversals()).toEqual([{ state: 'succeeded', quantity: 1, amount_minor: 500 }])
    expect(await income()).toBe(before + 500)
    expect(await rows("SELECT count(*) AS n FROM core_events WHERE name = 'bar.sale.refunded'")).toEqual([{ n: 1 }])
  })

  it('cannot refund past what was sold (T-N5)', async () => {
    expect((await refund({ lines: [{ lineId: line('Refunds bitter, Pint'), quantity: 2 }], expectedTotalMinor: 1000 })).body.code).toBe('bar.refund.too-much')
    // The database refuses it too, whatever the route checked.
    const id = line('Refunds bitter, Pint')
    await expect(env.DB.prepare("INSERT INTO bar_sale_reversals (id, sale_line_id, refund_id, state, quantity, amount_minor, reason_term, stock_outcome, requested_by, created_at, updated_at) VALUES ('bsrv_x', ?, 'rfd_x', 'requested', 2, 1000, ?, 'none', 'acc_x', 1, 1)").bind(id, stock.reason).run())
      .rejects.toThrow(/cannot pass what was sold/)
  })

  it('lets go of the line when the refund is declined (T-N6), and takes a goodwill amount', async () => {
    // 700 is over the self-approve limit, so it waits for a second person.
    const asked = await refund({ lines: [{ lineId: line('Refunds nuts'), quantity: 2 }, { lineId: line('Refunds bitter, Pint'), quantity: 0, goodwillMinor: 300 }], expectedTotalMinor: 700 })
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(asked.body.state).toBe('requested')
    expect((await refund({ lines: [{ lineId: line('Refunds nuts'), quantity: 1 }], expectedTotalMinor: 200 })).body.code).toBe('bar.refund.too-much')

    await commit(async (unit) => {
      await declineRefund(unit.view(), asked.body.refundId, 'acc_approver', stock.declineReason)
    })
    // The listener hears payments.refund.failed; run it as the event bus would.
    await commit(async unit => refundFailed({ payload: { refundId: asked.body.refundId, partId: 'x', owner: { moduleId: 'bar', recordId: 'x' } } } as any, unit.view()))
    expect((await reversals()).filter(r => r.state === 'failed').length).toBe(2)
    expect(await rows("SELECT count(*) AS n FROM core_events WHERE name = 'payments.refund.failed'")).toEqual([{ n: 1 }])

    const again = await refund({ lines: [{ lineId: line('Refunds nuts'), quantity: 1 }], expectedTotalMinor: 200 })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
  })

  it('keeps a reversal fixed once written', async () => {
    await expect(env.DB.prepare("UPDATE bar_sale_reversals SET quantity = 9 WHERE state = 'succeeded'").run()).rejects.toThrow(/only moves from requested/)
    await expect(env.DB.prepare("UPDATE bar_sale_reversals SET state = 'requested' WHERE state = 'succeeded'").run()).rejects.toThrow(/only moves from requested/)
    await expect(env.DB.prepare('DELETE FROM bar_sale_reversals').run()).rejects.toThrow(/never deleted/)
  })
})
