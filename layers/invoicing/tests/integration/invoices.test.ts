// Invoices out (Invoices and exports, IE-07 to IE-09, IE-13, IE-14; rules I-01 to I-25, I-41 to I-44):
// series and their numbers, drafts worked out on the server, issue posting Debtors, income and VAT in
// one batch, and money received allocated with nothing over and reversals reopening.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { ensureSystemAccounts } from '#modules/finance'
import { confirmRefund, requestRefund } from '#modules/payments'
import starterListener from '../../server/listeners/starter-profile'
import listGet from '../../server/api/invoicing/invoices/index.get'
import listPost from '../../server/api/invoicing/invoices/index.post'
import newGet from '../../server/api/invoicing/invoices/new.get'
import oneGet from '../../server/api/invoicing/invoices/[id].get'
import onePut from '../../server/api/invoicing/invoices/[id].put'
import oneDelete from '../../server/api/invoicing/invoices/[id].delete'
import issuePost from '../../server/api/invoicing/invoices/[id]/issue.post'
import paymentsPost from '../../server/api/invoicing/invoices/[id]/payments.post'
import seriesGet from '../../server/api/invoicing/series/index.get'
import seriesPost from '../../server/api/invoicing/series/index.post'
import seriesPatch from '../../server/api/invoicing/series/[id].patch'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const handle = server({
  'GET /api/invoicing/invoices': listGet,
  'POST /api/invoicing/invoices': listPost,
  'GET /api/invoicing/invoices/new': newGet,
  'GET /api/invoicing/invoices/:id': oneGet,
  'PUT /api/invoicing/invoices/:id': onePut,
  'DELETE /api/invoicing/invoices/:id': oneDelete,
  'POST /api/invoicing/invoices/:id/issue': issuePost,
  'POST /api/invoicing/invoices/:id/payments': paymentsPost,
  'GET /api/invoicing/series': seriesGet,
  'POST /api/invoicing/series': seriesPost,
  'PATCH /api/invoicing/series/:id': seriesPatch,
})
const ALL = ['invoicing.invoice.view', 'invoicing.invoice.draft', 'invoicing.invoice.issue', 'invoicing.payment.record', 'invoicing.settings.manage']
const treasurer = person(ALL, { reassertedAt: NOV_24 })
const deputy = person(ALL, { reassertedAt: NOV_24 })
const viewer = person(['invoicing.invoice.view'], { reassertedAt: NOV_24 })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const set = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key, value, { reason: 'test', confirm: true }))
const send = async (method: string, path: string, body?: unknown, actor = treasurer) => {
  const response = await call(handle, method, path, { actor, body, headers: { 'idempotency-key': crypto.randomUUID() } })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

let income: string
let bank: string
const line = (over: Record<string, unknown> = {}) => ({ description: 'Hire of the studio', quantityMilli: 2000, unitMinor: 4500, accountId: income, ...over })
const oneOff = (over: Record<string, unknown> = {}) => ({ party: { kind: 'one-off' }, billToName: 'Lakeside Players', billToAddress: '1 Lake Road', lines: [line()], ...over })

async function draft(body = oneOff(), actor = treasurer): Promise<string> {
  const made = await send('POST', '/api/invoicing/invoices', body, actor)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.invoiceId
}
const read = async (id: string, actor = treasurer) => (await send('GET', `/api/invoicing/invoices/${id}`, undefined, actor)).body
async function issued(body = oneOff()): Promise<{ id: string, number: string, totalMinor: number }> {
  const id = await draft(body, deputy)
  const { invoice } = await read(id)
  const done = await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: invoice.totalMinor })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return { id, number: done.body.number, totalMinor: invoice.totalMinor }
}
const pay = (id: string, amountMinor: number, receivedOn = '2026-11-24', actor = treasurer) =>
  send('POST', `/api/invoicing/invoices/${id}/payments`, { amountMinor, providerAccountId: bank, receivedOn, reference: 'BACS 123' }, actor)

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'invoicing']) await setModule(id, true)
  await set('core.locale.time-zone', 'Europe/London')
  await commit(async (unit) => {
    for (const id of ['finance', 'payments', 'invoicing']) await ensureSystemAccounts(unit.view(), id)
  })
  await commit(unit => starterListener({ payload: { moduleId: 'invoicing' } } as never, unit.view()))
  income = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'invoicing.other-income'"))[0]!.id
  bank = 'ppa_bank'
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'other', 'Bank transfer', '[\"desk\"]', 'live', 1, ?, ?)").bind(bank, NOV_24, NOV_24).run()
})

describe('series', () => {
  it('starts with INV- and CN-, and a new default takes over its kind', async () => {
    const { body } = await send('GET', '/api/invoicing/series')
    expect(body.series.map((s: { prefix: string, isDefault: boolean, next: string }) => [s.prefix, s.isDefault, s.next])).toEqual([['CN-', true, 'CN-0001'], ['INV-', true, 'INV-0001']].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
    const made = await send('POST', '/api/invoicing/series', { kind: 'invoice', name: 'Hires', prefix: 'HIRE-', pad: 3 })
    expect(made.status).toBe(200)
    expect((await send('PATCH', `/api/invoicing/series/${made.body.seriesId}`, { archived: true })).status).toBe(200)
    expect((await send('GET', '/api/invoicing/series', undefined, viewer)).status).toBe(403)
  })
})

describe('drafts', () => {
  it('works out each line on the server and keeps the version for the next change', async () => {
    const id = await draft(oneOff({ lines: [line(), line({ description: 'Lighting', quantityMilli: 1500, unitMinor: 333 })] }))
    const shown = await read(id)
    expect(shown.invoice).toMatchObject({ state: 'draft', number: null, netMinor: 9000 + 500, taxMinor: 0, totalMinor: 9500, billToName: 'Lakeside Players', label: 'draft' })
    expect(shown.lines.map((l: { netMinor: number, taxCode: string }) => [l.netMinor, l.taxCode])).toEqual([[9000, 'none'], [500, 'none']])
    expect(shown).toMatchObject({ canEdit: true, canIssue: true, canRecordPayment: false })

    const changed = await send('PUT', `/api/invoicing/invoices/${id}`, { ...oneOff({ lines: [line({ unitMinor: 5000 })] }), version: shown.invoice.version })
    expect(changed.status).toBe(200)
    const stale = await send('PUT', `/api/invoicing/invoices/${id}`, { ...oneOff(), version: shown.invoice.version })
    expect(stale).toMatchObject({ status: 409, body: { code: 'invoicing.invoice.changed' } })
    expect((await read(id)).invoice.totalMinor).toBe(10000)

    const now = (await read(id)).invoice
    expect((await send('DELETE', `/api/invoicing/invoices/${id}`, { version: now.version })).status).toBe(200)
    expect(await rows('SELECT id FROM invoicing_lines WHERE invoice_id = ?', id)).toEqual([])
  })

  it('refuses an account invoices do not post to, and a one-off with no name', async () => {
    const bad = await send('POST', '/api/invoicing/invoices', oneOff({ lines: [line({ accountId: 'fac_nowhere' })] }))
    expect(bad).toMatchObject({ status: 422, body: { code: 'invoicing.line.account' } })
    const nameless = await send('POST', '/api/invoicing/invoices', oneOff({ billToName: '' }))
    expect(nameless).toMatchObject({ status: 422, body: { code: 'invoicing.invoice.party' } })
    expect((await send('POST', '/api/invoicing/invoices', oneOff(), viewer)).status).toBe(403)
  })
})

describe('issue', () => {
  it('numbers, dates and posts it: Debtors the gross, income its net', async () => {
    const { id, number } = await issued()
    expect(number).toBe('INV-0001')
    const { invoice } = await read(id)
    expect(invoice).toMatchObject({ state: 'open', number: 'INV-0001', issueOn: '2026-11-24', dueOn: '2026-12-24', label: 'issued' })
    const entries = await rows<{ key: string | null, amount: number }>(
      'SELECT a.system_key AS key, e.amount_minor AS amount FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC', invoice.postingId)
    expect(entries).toEqual([{ key: 'invoicing.receivable', amount: 9000 }, { key: 'invoicing.other-income', amount: -9000 }])
    const posting = await rows<{ kind: string, purpose: string }>('SELECT kind, purpose FROM finance_postings WHERE id = ?', invoice.postingId)
    expect(posting).toEqual([{ kind: 'transfer', purpose: 'invoice' }])

    expect((await issued()).number).toBe('INV-0002')
    const again = await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 9000 })
    expect(again).toMatchObject({ status: 409, body: { code: 'invoicing.invoice.issued' } })
    expect((await send('PUT', `/api/invoicing/invoices/${id}`, { ...oneOff(), version: invoice.version })).status).toBe(409)
  })

  it('refuses a total that differs from the one shown, quoting both', async () => {
    const id = await draft()
    const { invoice } = await read(id)
    const wrong = await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 8000 })
    expect(wrong).toMatchObject({ status: 409, body: { code: 'invoicing.invoice.total-differs' } })
    expect(wrong.body.reason ?? wrong.body.message).toMatch(/80\.00.*90\.00/)
  })

  it('refuses a future date and one further back than the limit', async () => {
    const id = await draft()
    const { invoice } = await read(id)
    expect((await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 9000, issueOn: '2026-11-25' })).body.code).toBe('invoicing.invoice.future')
    expect((await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 9000, issueOn: '2026-10-01' })).body.code).toBe('invoicing.invoice.backdated')
    const back = await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 9000, issueOn: '2026-11-10' })
    expect(back.status).toBe(200)
    expect((await read(id)).invoice).toMatchObject({ issueOn: '2026-11-10', dueOn: '2026-12-10' })
  })

  it('above the second-person amount, whoever wrote it cannot issue it', async () => {
    await set('invoicing.issue.second-person-over', 5000)
    const id = await draft()
    const { invoice } = await read(id)
    const own = await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 9000 })
    expect(own).toMatchObject({ status: 403, body: { code: 'invoicing.invoice.second-person' } })
    expect((await send('POST', `/api/invoicing/invoices/${id}/issue`, { version: invoice.version, expectedTotalMinor: 9000 }, deputy)).status).toBe(200)
    await set('invoicing.issue.second-person-over', null)
  })

  it('while VAT-registered, charges each line\'s rate and posts the VAT to Finance\'s output account', async () => {
    await set('finance.tax.number', 'GB123456789')
    await set('finance.tax.registered', true)
    const choices = (await send('GET', '/api/invoicing/invoices/new')).body
    expect(choices).toMatchObject({ registered: true, defaultTaxCode: 'standard', taxNumberSet: true })
    expect(choices.taxCodes.map((c: { code: string }) => c.code)).toContain('standard')

    const { id } = await issued(oneOff({ lines: [line({ unitMinor: 1999, quantityMilli: 1000 }), line({ description: 'Programmes', taxCode: 'zero', quantityMilli: 3000, unitMinor: 250 })] }))
    const { invoice, lines } = await read(id)
    // 1999 at 20% is 399.8, rounded half up to 400.
    expect(lines.map((l: { netMinor: number, taxMinor: number, taxCode: string }) => [l.taxCode, l.netMinor, l.taxMinor])).toEqual([['standard', 1999, 400], ['zero', 750, 0]])
    expect(invoice).toMatchObject({ netMinor: 2749, taxMinor: 400, totalMinor: 3149, sellerTaxNumber: 'GB123456789' })
    const entries = await rows<{ key: string | null, amount: number, code: string, tax: number }>(
      'SELECT a.system_key AS key, e.amount_minor AS amount, e.tax_code AS code, e.tax_minor AS tax FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC', invoice.postingId)
    expect(entries).toEqual([
      { key: 'invoicing.receivable', amount: 3149, code: 'none', tax: 0 },
      { key: 'finance.vat-output', amount: -400, code: 'none', tax: 0 },
      { key: 'invoicing.other-income', amount: -750, code: 'zero', tax: 0 },
      { key: 'invoicing.other-income', amount: -1999, code: 'standard', tax: -400 },
    ])
    await set('finance.tax.registered', false)
  })
})

describe('payments received', () => {
  it('allocates a part payment, then closes the invoice when the rest arrives', async () => {
    const { id } = await issued()
    expect((await pay(id, 4000, '2026-11-20')).status).toBe(200)
    expect((await read(id)).invoice).toMatchObject({ state: 'open', allocatedMinor: 4000, label: 'part-paid' })
    const over = await pay(id, 6000)
    expect(over).toMatchObject({ status: 409, body: { code: 'invoicing.payment.over' } })
    expect((await pay(id, 5000)).status).toBe(200)
    const after = await read(id)
    expect(after.invoice).toMatchObject({ state: 'closed', allocatedMinor: 9000, label: 'paid' })
    expect(after.allocations.map((a: { kind: string, amountMinor: number, onDate: string }) => [a.kind, a.amountMinor, a.onDate])).toEqual([['payment', 4000, '2026-11-20'], ['payment', 5000, '2026-11-24']])
    expect((await rows<{ amount: number }>("SELECT sum(e.amount_minor) AS amount FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'invoicing.receivable' AND e.posting_id IN (SELECT id FROM finance_postings WHERE source_id = ? OR source_id IN (SELECT intent_id FROM invoicing_allocations WHERE invoice_id = ?))", id, id))[0]!.amount).toBe(0)
    expect((await pay(id, 1)).body.code).toBe('invoicing.invoice.not-open')
  })

  it('refuses a payment on a draft, from the future, or without the ability', async () => {
    const id = await draft()
    expect((await pay(id, 100)).body.code).toBe('invoicing.invoice.not-open')
    const open = await issued()
    expect((await pay(open.id, 100, '2026-11-25')).body.code).toBe('payments.received.future')
    expect((await pay(open.id, 100, '2026-11-24', viewer)).status).toBe(403)
  })

  it('money given back reopens the invoice with a reversal beside the payment', async () => {
    const { id } = await issued()
    expect((await pay(id, 9000)).status).toBe(200)
    const part = (await rows<{ id: string }>("SELECT p.id FROM payments_intent_parts p JOIN invoicing_allocations a ON a.intent_id = p.intent_id WHERE a.invoice_id = ? AND a.kind = 'payment'", id))[0]!.id
    await commit(async (unit) => {
      const { refundId } = await requestRefund(unit.view(), { partId: part, amountMinor: 2000, requestedBy: null })
      return refundId
    }).then(refundId => commit(unit => confirmRefund(unit.view(), refundId, treasurer.accountId!)))
    const after = await read(id)
    expect(after.invoice).toMatchObject({ state: 'open', allocatedMinor: 7000, label: 'part-paid' })
    expect(after.allocations.map((a: { kind: string, amountMinor: number }) => [a.kind, a.amountMinor])).toEqual([['payment', 9000], ['reversal', -2000]])
  })
})

describe('the list', () => {
  it('shows drafts first, then outstanding by due date', async () => {
    const { body } = await send('GET', '/api/invoicing/invoices', undefined, viewer)
    expect(body.canDraft).toBe(false)
    const states = body.invoices.map((i: { state: string }) => i.state)
    expect(states.indexOf('open')).toBeGreaterThan(states.lastIndexOf('draft'))
    expect(states.lastIndexOf('open')).toBeLessThan(states.indexOf('closed'))
  })
})
