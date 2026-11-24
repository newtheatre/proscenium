// Sending invoices out (Invoices and exports, IE-10, IE-11, IE-17, IE-18; rules I-16 to I-18, I-31
// to I-35): the PDF made after issue, the email with its link, the public page the link opens, the
// reminders the hourly task sends once each, and the debtors list's ageing.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, linkTokens, nowMs, setClock } from '#kit'
import { ensureSystemAccounts } from '#modules/finance'
import starterListener from '../../server/listeners/starter-profile'
import sendReminders from '../../server/tasks/send-reminders'
import listPost from '../../server/api/invoicing/invoices/index.post'
import oneGet from '../../server/api/invoicing/invoices/[id].get'
import issuePost from '../../server/api/invoicing/invoices/[id]/issue.post'
import sendPost from '../../server/api/invoicing/invoices/[id]/send.post'
import paymentsPost from '../../server/api/invoicing/invoices/[id]/payments.post'
import publicGet from '../../server/api/invoicing/pay/[token].get'
import publicPdf from '../../server/api/invoicing/pay/[token]/pdf.get'
import debtorsGet from '../../server/api/invoicing/debtors.get'
import { stepDue } from '../../server/sending'
import { bandOf } from '../../server/debtors'
import { call, deliver, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const DAY = 86_400_000
const handle = server({
  'POST /api/invoicing/invoices': listPost,
  'GET /api/invoicing/invoices/:id': oneGet,
  'POST /api/invoicing/invoices/:id/issue': issuePost,
  'POST /api/invoicing/invoices/:id/send': sendPost,
  'POST /api/invoicing/invoices/:id/payments': paymentsPost,
  'GET /api/invoicing/pay/:token': publicGet,
  'GET /api/invoicing/pay/:token/pdf': publicPdf,
  'GET /api/invoicing/debtors': debtorsGet,
})
const treasurer = person(['invoicing.invoice.issue', 'invoicing.payment.record'], { reassertedAt: NOV_24 })
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
  // Signed in again just now, whatever day the clock is on.
  const fresh = actor.kind === 'person' ? { ...actor, reassertedAt: nowMs() } : actor
  return call(handle, method, path, { actor: fresh, body, headers: { 'idempotency-key': crypto.randomUUID() } })
}
const json = async (method: string, path: string, body?: unknown, actor = treasurer) => {
  const response = await send(method, path, body, actor)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

let income: string
let bank: string
async function issued(options: { email?: string | null, send?: boolean, name?: string, unitMinor?: number } = {}): Promise<{ id: string, number: string }> {
  const made = await json('POST', '/api/invoicing/invoices', {
    party: { kind: 'one-off' },
    billToName: options.name ?? 'Lakeside Players',
    billToAddress: '1 Lake Road\nNottingham',
    billToEmail: options.email === undefined ? 'accounts@lakeside.example' : options.email,
    lines: [{ description: 'Hire of the studio, 3 to 5 December', quantityMilli: 2000, unitMinor: options.unitMinor ?? 4500, accountId: income }],
  })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const { invoice } = (await json('GET', `/api/invoicing/invoices/${made.body.invoiceId}`)).body
  const done = await json('POST', `/api/invoicing/invoices/${invoice.id}/issue`, { version: invoice.version, expectedTotalMinor: invoice.totalMinor, ...(options.send === false ? { send: false } : {}) })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return { id: invoice.id, number: done.body.number }
}
const tokenOf = async (id: string) => {
  const [row] = await rows<{ expiresAt: number }>('SELECT pay_token_expires_at AS expiresAt FROM invoicing_invoices WHERE id = ?', id)
  return inContext(() => linkTokens.hash(`invoicing.pay:${id}:${row!.expiresAt}`))
}
const stepsOf = async (id: string) => (await rows<{ step: string }>('SELECT step FROM invoicing_reminders WHERE invoice_id = ? ORDER BY created_at', id)).map(r => r.step)
const runReminders = () => commit(unit => sendReminders(unit.view()))

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'invoicing']) await setModule(id, true)
  await set('core.locale.time-zone', 'Europe/London')
  await set('core.site.origin', 'https://theatre.example')
  await set('core.organisation.legal-name', 'The New Theatre')
  await set('invoicing.pay.bank-details', 'Sort code 00-00-00, account 12345678')
  await commit(async (unit) => {
    for (const id of ['finance', 'payments', 'invoicing']) await ensureSystemAccounts(unit.view(), id)
  })
  await commit(unit => starterListener({ payload: { moduleId: 'invoicing' } } as never, unit.view()))
  income = (await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'invoicing.other-income'"))[0]!.id
  bank = 'ppa_bank'
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'other', 'Bank transfer', '[\"desk\"]', 'live', 1, ?, ?)").bind(bank, NOV_24, NOV_24).run()
})

describe('after issue', () => {
  it('makes the PDF from the issued invoice, then emails it with its link', async () => {
    const { id, number } = await issued()
    expect(await stepsOf(id)).toEqual([])
    await deliver()
    const [kept] = await rows<{ fileId: string, state: string, media: string, size: number }>(
      'SELECT f.id AS fileId, f.state, f.media_type AS media, f.byte_size AS size FROM invoicing_invoices i JOIN core_files f ON f.id = i.pdf_file_id WHERE i.id = ?', id)
    expect(kept).toMatchObject({ state: 'ready', media: 'application/pdf' })
    expect(kept!.size).toBeGreaterThan(500)
    expect(await stepsOf(id)).toEqual(['sent'])
    const [mail] = await rows<{ address: string, payload: string }>("SELECT address, payload FROM core_notifications WHERE type_key = 'invoicing.invoice' AND subject_id = ?", id)
    expect(mail!.address).toBe('accounts@lakeside.example')
    expect(JSON.parse(mail!.payload)).toMatchObject({ number, amount: '£90.00', due: '24 December 2026' })
    // The link is sealed, never in the payload.
    expect(mail!.payload).not.toContain('/invoice/')

    // A second run of the job sends nothing more.
    await commit(async unit => (await import('../../server/sending')).afterIssue(unit.view(), { invoiceId: id, send: true, byId: null }))
    expect(await stepsOf(id)).toEqual(['sent'])
    const shown = (await json('GET', `/api/invoicing/invoices/${id}`)).body
    expect(shown.pdfUrl).toBe(`/files/${kept!.fileId}`)
    expect(shown.sends.map((s: { step: string }) => s.step)).toEqual(['sent'])
  })

  it('without an address, or with Send now unticked, makes the PDF and sends nothing', async () => {
    const none = await issued({ email: null })
    const held = await issued({ send: false })
    await deliver()
    for (const { id } of [none, held]) {
      expect(await stepsOf(id)).toEqual([])
      expect((await rows('SELECT pdf_file_id FROM invoicing_invoices WHERE id = ? AND pdf_file_id IS NOT NULL', id)).length).toBe(1)
    }
    // Sent by hand later, it goes as the invoice; after that, as a reminder.
    expect((await json('POST', `/api/invoicing/invoices/${held.id}/send`, {})).body).toEqual({ step: 'sent' })
    expect((await json('POST', `/api/invoicing/invoices/${held.id}/send`, {})).body).toEqual({ step: 'manual' })
    expect(await stepsOf(held.id)).toEqual(['sent', 'manual'])
    expect((await json('POST', `/api/invoicing/invoices/${none.id}/send`, {})).body.code).toBe('invoicing.invoice.no-email')
    expect((await json('POST', `/api/invoicing/invoices/${held.id}/send`, {}, viewer)).status).toBe(403)
  })
})

describe('the public invoice', () => {
  it('opens with the link: what is owed, how to pay, and the PDF', async () => {
    const { id, number } = await issued()
    await deliver()
    const token = await tokenOf(id)
    const page = await json('GET', `/api/invoicing/pay/${token}`, undefined, { kind: 'anonymous' } as never)
    expect(page.status).toBe(200)
    expect(page.body).toMatchObject({ number, theatre: 'The New Theatre', totalMinor: 9000, owedMinor: 9000, bankDetails: 'Sort code 00-00-00, account 12345678', pdfReady: true })
    expect(JSON.stringify(page.body)).not.toContain('1 Lake Road')
    const pdf = await send('GET', `/api/invoicing/pay/${token}/pdf`, undefined, { kind: 'anonymous' } as never)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe('%PDF-')

    expect((await json('GET', '/api/invoicing/pay/not-a-token', undefined, { kind: 'anonymous' } as never)).status).toBe(404)
    // Paid, it shows nothing owed.
    expect((await json('POST', `/api/invoicing/invoices/${id}/payments`, { amountMinor: 9000, providerAccountId: bank, receivedOn: '2026-11-24', reference: 'BACS' })).status).toBe(200)
    expect((await json('GET', `/api/invoicing/pay/${token}`, undefined, { kind: 'anonymous' } as never)).body.owedMinor).toBe(0)
  })
})

describe('reminders', () => {
  it('works out which step is due', () => {
    const days = { before: 3, first: 7, second: 21 }
    expect(stepDue('2026-12-24', '2026-12-20', days)).toBeNull()
    expect(stepDue('2026-12-24', '2026-12-21', days)).toBe('before-due')
    expect(stepDue('2026-12-24', '2026-12-24', days)).toBe('before-due')
    expect(stepDue('2026-12-24', '2026-12-25', days)).toBeNull()
    expect(stepDue('2026-12-24', '2026-12-31', days)).toBe('overdue-1')
    expect(stepDue('2026-12-24', '2027-01-14', days)).toBe('overdue-2')
    expect(stepDue('2026-12-24', '2026-12-23', { ...days, before: 0 })).toBeNull()
  })

  it('sends each step once, after the day\'s sending time, and nothing once it is paid', async () => {
    await rows("UPDATE invoicing_invoices SET reminders_on = 0 WHERE state = 'open'")
    const { id } = await issued({ name: 'Riverside Opera' })
    const paid = await issued({ name: 'Paid Promptly' })
    await deliver()
    expect((await json('POST', `/api/invoicing/invoices/${paid.id}/payments`, { amountMinor: 9000, providerAccountId: bank, receivedOn: '2026-11-24', reference: 'BACS' })).status).toBe(200)

    // 21 December, 09:00 in London: three days before it falls due, but before 10:00.
    setClock(Date.UTC(2026, 11, 21, 9))
    await runReminders()
    expect(await stepsOf(id)).toEqual(['sent'])
    setClock(Date.UTC(2026, 11, 21, 10, 30))
    await runReminders()
    await runReminders()
    expect(await stepsOf(id)).toEqual(['sent', 'before-due'])
    setClock(Date.UTC(2026, 11, 31, 11))
    await runReminders()
    advanceClock(DAY)
    await runReminders()
    expect(await stepsOf(id)).toEqual(['sent', 'before-due', 'overdue-1'])
    setClock(Date.UTC(2027, 0, 14, 11))
    await runReminders()
    expect(await stepsOf(id)).toEqual(['sent', 'before-due', 'overdue-1', 'overdue-2'])
    expect(await stepsOf(paid.id)).toEqual(['sent'])
    const [reminder] = await rows<{ payload: string }>("SELECT payload FROM core_notifications WHERE type_key = 'invoicing.reminder' AND subject_id = ? ORDER BY created_at DESC LIMIT 1", id)
    expect(JSON.parse(reminder!.payload)).toMatchObject({ amount: '£90.00' })
    setClock(NOV_24)
  })

  it('sends none while reminders are off', async () => {
    await rows("UPDATE invoicing_invoices SET reminders_on = 0 WHERE state = 'open'")
    const { id } = await issued({ name: 'Quiet Company' })
    await deliver()
    await set('invoicing.reminders.enabled', false)
    setClock(Date.UTC(2026, 11, 31, 11))
    await runReminders()
    expect(await stepsOf(id)).toEqual(['sent'])
    setClock(NOV_24)
    await set('invoicing.reminders.enabled', true)
  })
})

describe('owed to us', () => {
  it('bands days overdue as rule I-34 says', () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(bandOf)).toEqual(['current', '1-30', '1-30', '31-60', '31-60', '61-90', '61-90', 'over-90'])
  })

  it('lists each party with its open invoices, most overdue first', async () => {
    await issued({ name: 'Old Debt Ltd', unitMinor: 1000 })
    setClock(Date.UTC(2027, 1, 10, 12))
    const { body } = await json('GET', '/api/invoicing/debtors', undefined, viewer)
    const names = body.debtors.map((d: { name: string }) => d.name)
    expect(names).toContain('Old Debt Ltd')
    expect(names).not.toContain('Paid Promptly')
    const old = body.debtors.find((d: { name: string }) => d.name === 'Old Debt Ltd')
    expect(old).toMatchObject({ owedMinor: 2000, daysOverdue: 48, bands: { '31-60': 2000 } })
    const days = body.debtors.map((d: { daysOverdue: number }) => d.daysOverdue)
    expect(days).toEqual([...days].sort((a: number, b: number) => b - a))
    setClock(NOV_24)
  })
})
