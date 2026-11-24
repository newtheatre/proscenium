// Credit notes out and write-offs (Invoices and exports, IE-15 and IE-27; rules I-26 to I-28, I-44,
// I-45): a credit note reverses the lines it names and is allocated up to what is outstanding; a
// write-off posts the rest to bad debts once the invoice is overdue long enough. Neither is done by
// whoever issued the invoice.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, nowMs, setClock } from '#kit'
import { ensureSystemAccounts } from '#modules/finance'
import starterListener from '../../server/listeners/starter-profile'
import listPost from '../../server/api/invoicing/invoices/index.post'
import oneGet from '../../server/api/invoicing/invoices/[id].get'
import issuePost from '../../server/api/invoicing/invoices/[id]/issue.post'
import creditPost from '../../server/api/invoicing/invoices/[id]/credit.post'
import writeOffPost from '../../server/api/invoicing/invoices/[id]/write-off.post'
import paymentsPost from '../../server/api/invoicing/invoices/[id]/payments.post'
import { call, deliver, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const DAY = 86_400_000
const handle = server({
  'POST /api/invoicing/invoices': listPost,
  'GET /api/invoicing/invoices/:id': oneGet,
  'POST /api/invoicing/invoices/:id/issue': issuePost,
  'POST /api/invoicing/invoices/:id/credit': creditPost,
  'POST /api/invoicing/invoices/:id/write-off': writeOffPost,
  'POST /api/invoicing/invoices/:id/payments': paymentsPost,
})
// Issues invoices and could credit them, but never one they issued.
const issuer = person(['invoicing.invoice.issue', 'invoicing.payment.record', 'invoicing.invoice.credit', 'invoicing.invoice.write-off'])
const second = person(['invoicing.invoice.credit', 'invoicing.payment.record'])
const chair = person(['invoicing.invoice.write-off'])

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const set = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key, value, { reason: 'test', confirm: true }))
const json = async (method: string, path: string, body?: unknown, actor = issuer) => {
  const response = await call(handle, method, path, { actor: { ...actor, reassertedAt: nowMs() }, body, headers: { 'idempotency-key': crypto.randomUUID() } })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
const view = async (id: string, actor = issuer) => (await json('GET', `/api/invoicing/invoices/${id}`, undefined, actor)).body

let income: string
let bank: string
async function issued(lines: Record<string, unknown>[]): Promise<{ id: string, lines: { id: string, netMinor: number, taxMinor: number }[] }> {
  const made = await json('POST', '/api/invoicing/invoices', { party: { kind: 'one-off' }, billToName: 'Lakeside Players', lines: lines.map(l => ({ description: 'Hire of the studio', quantityMilli: 1000, accountId: income, ...l })) })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const { invoice } = await view(made.body.invoiceId)
  const done = await json('POST', `/api/invoicing/invoices/${invoice.id}/issue`, { version: invoice.version, expectedTotalMinor: invoice.totalMinor, send: false })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return { id: invoice.id, lines: (await view(invoice.id)).lines }
}
const entriesOf = (postingId: string) => rows<{ key: string | null, amount: number, code: string, tax: number }>(
  'SELECT a.system_key AS key, e.amount_minor AS amount, e.tax_code AS code, e.tax_minor AS tax FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC, a.system_key', postingId)

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'invoicing']) await setModule(id, true)
  await set('core.locale.time-zone', 'Europe/London')
  await commit(async (unit) => {
    for (const id of ['finance', 'payments', 'invoicing']) await ensureSystemAccounts(unit.view(), id)
  })
  await commit(unit => starterListener({ payload: { moduleId: 'invoicing' } } as never, unit.view()))
  const { ensureVocabularies } = await import('../../../core/server/vocabularies/service')
  await inContext(() => ensureVocabularies())
  income = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'invoicing.other-income'"))[0]!.id
  bank = 'ppa_credits_bank'
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'other', 'Bank transfer', '[\"desk\"]', 'live', 1, ?, ?)").bind(bank, NOV_24, NOV_24).run()
})

describe('credit notes', () => {
  it('are never made by whoever issued the invoice (I-27)', async () => {
    const { id, lines } = await issued([{ unitMinor: 10000 }])
    expect((await view(id)).canCredit).toBe(false)
    const refused = await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 10000 }], expectedTotalMinor: 10000 })
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('invoicing.credit.own')
    expect((await view(id, second)).canCredit).toBe(true)
  })

  it('crediting the whole of an unpaid invoice numbers it, reverses the posting and closes the invoice', async () => {
    const { id, lines } = await issued([{ unitMinor: 10000 }])
    const done = await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 10000 }], expectedTotalMinor: 10000 }, second)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.number).toMatch(/^CN-\d{4}$/)
    const original = await view(id, second)
    expect(original.invoice).toMatchObject({ state: 'closed', allocatedMinor: 10000, label: 'credited' })
    expect(original.creditNotes).toEqual([expect.objectContaining({ id: done.body.creditNoteId, number: done.body.number, totalMinor: 10000 })])
    expect(original.canCredit).toBe(false)
    const note = await view(done.body.creditNoteId, second)
    expect(note.invoice).toMatchObject({ kind: 'credit_note', state: 'closed', totalMinor: 10000, label: 'credit-note' })
    expect(note.credits).toMatchObject({ id })
    expect(note.canRecordPayment).toBe(false)
    expect(await entriesOf(note.invoice.postingId)).toEqual([
      { key: 'invoicing.other-income', amount: 10000, code: 'none', tax: 0 },
      { key: 'invoicing.receivable', amount: -10000, code: 'none', tax: 0 },
    ])
    const [posting] = await rows<{ purpose: string }>('SELECT purpose FROM finance_postings WHERE id = ?', note.invoice.postingId)
    expect(posting!.purpose).toBe('credit_note')
    // Its PDF is made after issue, and it is never emailed as an invoice.
    await deliver()
    expect((await rows('SELECT id FROM invoicing_invoices WHERE id = ? AND pdf_file_id IS NOT NULL', done.body.creditNoteId)).length).toBe(1)
    expect((await rows('SELECT id FROM invoicing_reminders WHERE invoice_id = ?', done.body.creditNoteId)).length).toBe(0)
  })

  it('never credits more than is left, whatever earlier credit notes took', async () => {
    const { id, lines } = await issued([{ unitMinor: 6000 }, { description: 'Lighting', unitMinor: 4000 }])
    expect((await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 6001 }], expectedTotalMinor: 6001 }, second)).body.code).toBe('invoicing.credit.line-over')
    expect((await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 6000 }], expectedTotalMinor: 6000 }, second)).status).toBe(200)
    expect((await view(id, second)).invoice).toMatchObject({ state: 'open', allocatedMinor: 6000, label: 'part-paid' })
    expect((await view(id, second)).creditableMinor).toBe(4000)
    const again = await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 6000 }], expectedTotalMinor: 6000 }, second)
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('invoicing.credit.over')
  })

  it('crediting a paid invoice leaves the rest open on the credit note as money to give back (I-credit-refund)', async () => {
    const { id, lines } = await issued([{ unitMinor: 5000 }])
    expect((await json('POST', `/api/invoicing/invoices/${id}/payments`, { amountMinor: 5000, providerAccountId: bank, receivedOn: '2026-11-24', reference: 'LAKESIDE' }, second)).status).toBe(200)
    expect((await view(id, second)).invoice.state).toBe('closed')
    const done = await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 2000 }], expectedTotalMinor: 2000 }, second)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect((await view(done.body.creditNoteId, second)).invoice).toMatchObject({ state: 'open', allocatedMinor: 0, totalMinor: 2000, label: 'to-give-back' })
    expect((await view(id, second)).invoice).toMatchObject({ state: 'closed', allocatedMinor: 5000, label: 'paid' })
  })

  it('reverses half a line\'s net and half its VAT at the rate copied onto the line (V-credit-vat)', async () => {
    await set('finance.tax.number', 'GB123456789')
    await set('finance.tax.registered', true)
    const { id, lines } = await issued([{ unitMinor: 10000, taxCode: 'standard' }])
    expect(lines[0]).toMatchObject({ netMinor: 10000, taxMinor: 2000 })
    const done = await json('POST', `/api/invoicing/invoices/${id}/credit`, { lines: [{ lineId: lines[0]!.id, netMinor: 5000 }], expectedTotalMinor: 6000 }, second)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    const note = await view(done.body.creditNoteId, second)
    expect(note.lines).toEqual([expect.objectContaining({ netMinor: 5000, taxMinor: 1000, taxCode: 'standard', taxRateBp: 2000 })])
    expect(await entriesOf(note.invoice.postingId)).toEqual([
      { key: 'invoicing.other-income', amount: 5000, code: 'standard', tax: 1000 },
      { key: 'finance.vat-output', amount: 1000, code: 'none', tax: 0 },
      { key: 'invoicing.receivable', amount: -6000, code: 'none', tax: 0 },
    ])
    await set('finance.tax.registered', false)
  })
})

describe('write-offs', () => {
  it('waits until the invoice is overdue long enough, refuses the issuer, and posts bad debts once (I-write-off)', async () => {
    const { id } = await issued([{ unitMinor: 7000 }])
    const reason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'invoicing.write-off-reason' AND slug = 'customer-gone'"))[0]!.id
    expect((await view(id, chair)).canWriteOff).toBe(false)
    expect((await json('POST', `/api/invoicing/invoices/${id}/write-off`, { reasonTermId: reason, expectedOutstandingMinor: 7000 }, chair)).body.code).toBe('invoicing.write-off.too-soon')
    // Due in 30 days, then 90 more overdue.
    advanceClock(121 * DAY)
    expect((await view(id, chair)).canWriteOff).toBe(true)
    expect((await view(id)).canWriteOff).toBe(false)
    expect((await json('POST', `/api/invoicing/invoices/${id}/write-off`, { reasonTermId: reason, expectedOutstandingMinor: 7000 })).body.code).toBe('invoicing.write-off.own')
    expect((await json('POST', `/api/invoicing/invoices/${id}/write-off`, { reasonTermId: 'not-a-term', expectedOutstandingMinor: 7000 }, chair)).body.code).toBe('invoicing.write-off.reason')
    expect((await json('POST', `/api/invoicing/invoices/${id}/write-off`, { reasonTermId: reason, expectedOutstandingMinor: 7000 }, chair)).status).toBe(200)
    const after = await view(id, chair)
    expect(after.invoice).toMatchObject({ state: 'closed', allocatedMinor: 7000, label: 'written-off' })
    const [allocation] = await rows<{ postingId: string, reason: string }>("SELECT posting_id AS postingId, reason_term AS reason FROM invoicing_allocations WHERE invoice_id = ? AND kind = 'write_off'", id)
    expect(allocation!.reason).toBe(reason)
    expect(await entriesOf(allocation!.postingId)).toEqual([
      { key: 'invoicing.bad-debts', amount: 7000, code: 'none', tax: 0 },
      { key: 'invoicing.receivable', amount: -7000, code: 'none', tax: 0 },
    ])
    expect((await json('POST', `/api/invoicing/invoices/${id}/write-off`, { reasonTermId: reason, expectedOutstandingMinor: 7000 }, chair)).body.code).toBe('invoicing.write-off.not-open')
  })
})
