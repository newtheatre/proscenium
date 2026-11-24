// Bills in (Invoices and exports, IE-19 and IE-20; rules I-10, I-11, I-43, I-44): a supplier's bill
// logged with its file, submitted, sent back or approved by someone else, and posted once.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, nowMs, setClock } from '#kit'
import { ensureSystemAccounts } from '#modules/finance'
import upload from '../../../core/server/api/core/files/index.post'
import listGet from '../../server/api/invoicing/bills/index.get'
import listPost from '../../server/api/invoicing/bills/index.post'
import newGet from '../../server/api/invoicing/bills/new.get'
import oneGet from '../../server/api/invoicing/bills/[id].get'
import onePut from '../../server/api/invoicing/bills/[id].put'
import oneDelete from '../../server/api/invoicing/bills/[id].delete'
import filePost from '../../server/api/invoicing/bills/[id]/file.post'
import submitPost from '../../server/api/invoicing/bills/[id]/submit.post'
import approvePost from '../../server/api/invoicing/bills/[id]/approve.post'
import returnPost from '../../server/api/invoicing/bills/[id]/return.post'
import { call, deliver, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const handle = server({
  'POST /api/core/files': upload,
  'GET /api/invoicing/bills': listGet,
  'POST /api/invoicing/bills': listPost,
  'GET /api/invoicing/bills/new': newGet,
  'GET /api/invoicing/bills/:id': oneGet,
  'PUT /api/invoicing/bills/:id': onePut,
  'DELETE /api/invoicing/bills/:id': oneDelete,
  'POST /api/invoicing/bills/:id/file': filePost,
  'POST /api/invoicing/bills/:id/submit': submitPost,
  'POST /api/invoicing/bills/:id/approve': approvePost,
  'POST /api/invoicing/bills/:id/return': returnPost,
})
const logger = person(['invoicing.bill.log'])
// Holds every bill ability, as an Owner would; still never approves a bill they logged.
const treasurer = person(['invoicing.bill.log', 'invoicing.bill.approve'])
const approver = person(['invoicing.bill.approve'])
const viewer = person(['invoicing.bill.view'])

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const set = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key, value, { reason: 'test', confirm: true }))
const send = (method: string, path: string, body?: unknown, actor = logger) => {
  const fresh = actor.kind === 'person' ? { ...actor, reassertedAt: nowMs() } : actor
  const raw = body instanceof Uint8Array
  return call(handle, method, path, { actor: fresh, body: raw ? undefined : body, headers: { 'idempotency-key': crypto.randomUUID() } })
}
const json = async (method: string, path: string, body?: unknown, actor = logger) => {
  const response = await send(method, path, body, actor)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
async function uploadPdf(billId: string, actor = logger): Promise<string> {
  const bytes = new TextEncoder().encode('%PDF-1.4\n% a supplier\'s invoice\n%%EOF\n')
  const response = await handle(new Request(`http://test/api/core/files?slot=invoicing.bill-file&owner=${billId}&name=invoice.pdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-test-actor': JSON.stringify({ ...actor, reassertedAt: nowMs() }) },
    body: bytes as BodyInit,
  }))
  const body = await response.json() as { id: string }
  expect(response.status, JSON.stringify(body)).toBe(200)
  await deliver()
  return body.id
}

let expense: string
let n = 0
const line = (extra: Record<string, unknown> = {}) => ({ description: 'Timber for the set', quantityMilli: 1000, unitMinor: 12000, accountId: expense, ...extra })
async function logged(options: { name?: string, number?: string, lines?: unknown[], actor?: typeof logger } = {}): Promise<string> {
  const made = await json('POST', '/api/invoicing/bills', {
    party: { kind: 'one-off' },
    billToName: options.name ?? 'Trent Timber Ltd',
    supplierNumber: options.number ?? `TT-${++n}`,
    issueOn: '2026-11-20',
    lines: options.lines ?? [line()],
  }, options.actor ?? logger)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.billId
}
const bill = async (id: string, actor = viewer) => (await json('GET', `/api/invoicing/bills/${id}`, undefined, actor)).body
async function submitted(options: Parameters<typeof logged>[0] = {}): Promise<string> {
  const id = await logged(options)
  const fileId = await uploadPdf(id, options.actor ?? logger)
  expect((await json('POST', `/api/invoicing/bills/${id}/file`, { fileId }, options.actor ?? logger)).status).toBe(200)
  const { version } = (await bill(id)).bill
  const done = await json('POST', `/api/invoicing/bills/${id}/submit`, { version }, options.actor ?? logger)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return id
}

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'invoicing']) await setModule(id, true)
  await set('core.locale.time-zone', 'Europe/London')
  await commit(async (unit) => {
    for (const id of ['finance', 'payments', 'invoicing']) await ensureSystemAccounts(unit.view(), id)
  })
  expense = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'invoicing.general-expenses'"))[0]!.id
})

describe('logging a bill', () => {
  it('codes it to any expense account and keeps it a draft until submitted', async () => {
    const { choices } = (await json('GET', '/api/invoicing/bills/new')).body
    expect(choices.accounts.map((a: { id: string }) => a.id)).toContain(expense)
    expect(choices.accounts.some((a: { name: string }) => a.name === 'Other income')).toBe(false)
    const id = await logged()
    const shown = await bill(id)
    expect(shown.bill).toMatchObject({ direction: 'in', state: 'draft', billToName: 'Trent Timber Ltd', totalMinor: 12000, seriesId: null })
    expect(shown.lines).toHaveLength(1)
    expect(shown.canApprove).toBe(false)
  })

  it('refuses an income account on a line', async () => {
    const income = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'invoicing.other-income'"))[0]!.id
    const made = await json('POST', '/api/invoicing/bills', { party: { kind: 'one-off' }, billToName: 'Trent Timber Ltd', supplierNumber: 'X-1', lines: [line({ accountId: income })] })
    expect(made.body.code).toBe('invoicing.line.account')
  })

  it('needs the supplier\'s file before it is submitted (B-file-required)', async () => {
    const id = await logged()
    const { version } = (await bill(id)).bill
    const refused = await json('POST', `/api/invoicing/bills/${id}/submit`, { version })
    expect(refused.body.code).toBe('invoicing.bill.no-file')
    const fileId = await uploadPdf(id)
    expect((await json('POST', `/api/invoicing/bills/${id}/file`, { fileId })).status).toBe(200)
    expect((await json('POST', `/api/invoicing/bills/${id}/submit`, { version: (await bill(id)).bill.version })).status).toBe(200)
    const shown = await bill(id)
    expect(shown.bill.state).toBe('submitted')
    expect(shown.bill.dueOn).toBe('2026-12-20')
    expect(shown.fileUrl).toBe(`/files/${fileId}`)
  })

  it('refuses the same supplier number for the same supplier, naming the earlier bill (B-duplicate)', async () => {
    const first = await logged({ name: 'Midland Lighting', number: 'ML-100' })
    const again = await json('POST', '/api/invoicing/bills', { party: { kind: 'one-off' }, billToName: 'midland lighting', supplierNumber: 'ML-100', lines: [line()] })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('invoicing.bill.duplicate')
    expect(JSON.stringify(again.body)).toContain(first)
    // Another supplier may use the same number.
    await logged({ name: 'Castle Paints', number: 'ML-100' })
  })

  it('deletes a draft but not a submitted bill', async () => {
    const draft = await logged()
    expect((await json('DELETE', `/api/invoicing/bills/${draft}`, { version: (await bill(draft)).bill.version })).body).toEqual({ deleted: true })
    const sent = await submitted()
    expect((await json('DELETE', `/api/invoicing/bills/${sent}`, { version: (await bill(sent)).bill.version })).body.code).toBe('invoicing.bill.submitted')
  })
})

describe('approving a bill', () => {
  it('is never done by whoever logged it, whatever they hold (B-own-approval)', async () => {
    const id = await submitted({ actor: treasurer })
    const { bill: shown, canApprove } = await bill(id, treasurer)
    expect(canApprove).toBe(false)
    const refused = await json('POST', `/api/invoicing/bills/${id}/approve`, { version: shown.version, expectedTotalMinor: shown.totalMinor }, treasurer)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('invoicing.bill.own')
    expect((await json('GET', '/api/invoicing/bills', undefined, treasurer)).body.bills.find((b: { id: string }) => b.id === id)).toMatchObject({ mine: true, mayApprove: false })
    expect((await bill(id, approver)).canApprove).toBe(true)
    expect((await json('POST', `/api/invoicing/bills/${id}/approve`, { version: shown.version, expectedTotalMinor: shown.totalMinor }, approver)).status).toBe(200)
  })

  it('posts once: Dr the expense, Cr Creditors, and the bill is open', async () => {
    const id = await submitted()
    const { bill: shown } = await bill(id)
    expect((await json('POST', `/api/invoicing/bills/${id}/approve`, { version: shown.version, expectedTotalMinor: 99 }, approver)).body.code).toBe('invoicing.bill.total-differs')
    expect((await json('POST', `/api/invoicing/bills/${id}/approve`, { version: shown.version, expectedTotalMinor: shown.totalMinor }, approver)).status).toBe(200)
    const after = (await bill(id)).bill
    expect(after).toMatchObject({ state: 'open' })
    const entries = await rows<{ key: string | null, amount: number }>(
      'SELECT a.system_key AS key, e.amount_minor AS amount FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC', after.postingId)
    expect(entries).toEqual([{ key: 'invoicing.general-expenses', amount: 12000 }, { key: 'invoicing.payable', amount: -12000 }])
    const [posting] = await rows<{ purpose: string }>('SELECT purpose FROM finance_postings WHERE id = ?', after.postingId)
    expect(posting!.purpose).toBe('bill')
    // A second approval finds it already approved.
    expect((await json('POST', `/api/invoicing/bills/${id}/approve`, { version: after.version, expectedTotalMinor: after.totalMinor }, approver)).body.code).toBe('invoicing.bill.not-submitted')
    expect((await rows('SELECT id FROM finance_postings WHERE source_id = ?', id)).length).toBe(1)
  })

  it('sends a bill back with a reason; the logger fixes it and submits again', async () => {
    const id = await submitted()
    const { bill: shown } = await bill(id)
    expect((await json('POST', `/api/invoicing/bills/${id}/return`, { version: shown.version, note: '' }, approver)).status).toBe(422)
    expect((await json('POST', `/api/invoicing/bills/${id}/return`, { version: shown.version, note: 'The quantity is 2, not 1.' }, approver)).status).toBe(200)
    const back = (await bill(id)).bill
    expect(back).toMatchObject({ state: 'draft', returnedNote: 'The quantity is 2, not 1.' })
    expect((await json('PUT', `/api/invoicing/bills/${id}`, {
      version: back.version, party: { kind: 'one-off' }, billToName: back.billToName, supplierNumber: back.number, issueOn: back.issueOn, lines: [line({ quantityMilli: 2000 })],
    })).status).toBe(200)
    expect((await json('POST', `/api/invoicing/bills/${id}/submit`, { version: (await bill(id)).bill.version })).status).toBe(200)
    expect((await bill(id)).bill).toMatchObject({ state: 'submitted', totalMinor: 24000, returnedNote: '' })
  })
})

describe('VAT on bills', () => {
  it('takes the VAT typed from the supplier\'s invoice and debits it to input VAT (V-bill-input)', async () => {
    await set('finance.tax.number', 'GB123456789')
    await set('finance.tax.registered', true)
    // The rate gives 2000 on 10000; the supplier charged 2001, which is what may be reclaimed.
    const id = await submitted({ lines: [line({ unitMinor: 10000, taxCode: 'standard', taxMinor: 2001 }), line({ description: 'Delivery', unitMinor: 500, taxCode: 'zero' })] })
    const { bill: shown, lines } = await bill(id)
    expect(lines.map((l: { taxCode: string, taxMinor: number }) => [l.taxCode, l.taxMinor])).toEqual([['standard', 2001], ['zero', 0]])
    expect(shown).toMatchObject({ netMinor: 10500, taxMinor: 2001, totalMinor: 12501 })
    expect((await json('POST', `/api/invoicing/bills/${id}/approve`, { version: shown.version, expectedTotalMinor: shown.totalMinor }, approver)).status).toBe(200)
    const entries = await rows<{ key: string | null, amount: number, code: string, tax: number, forModule: string }>(
      'SELECT a.system_key AS key, e.amount_minor AS amount, e.tax_code AS code, e.tax_minor AS tax, e.for_module AS forModule FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC',
      (await bill(id)).bill.postingId)
    expect(entries).toEqual([
      { key: 'invoicing.general-expenses', amount: 10000, code: 'standard', tax: 2001, forModule: null },
      { key: 'finance.vat-input', amount: 2001, code: 'none', tax: 0, forModule: 'finance' },
      { key: 'invoicing.general-expenses', amount: 500, code: 'zero', tax: 0, forModule: null },
      { key: 'invoicing.payable', amount: -12501, code: 'none', tax: 0, forModule: null },
    ])
    await set('finance.tax.registered', false)
  })
})

describe('the list', () => {
  it('shows an approver what waits for them, and a viewer may not log or approve', async () => {
    const id = await submitted()
    const forApprover = (await json('GET', '/api/invoicing/bills', undefined, approver)).body
    expect(forApprover.canApprove).toBe(true)
    expect(forApprover.bills.find((b: { id: string }) => b.id === id)).toMatchObject({ state: 'submitted', mayApprove: true, mine: false })
    const forViewer = (await json('GET', '/api/invoicing/bills', undefined, viewer)).body
    expect(forViewer).toMatchObject({ canLog: false, canApprove: false })
    expect((await json('POST', '/api/invoicing/bills', { party: { kind: 'one-off' }, billToName: 'X', lines: [] }, viewer)).status).toBe(403)
    expect(env).toBeDefined()
  })
})
