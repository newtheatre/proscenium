// The exports gate (Invoices and exports, IE-01 to IE-06; rules E-01 to E-11): profiles and their code
// maps, coverage before download, the journal and the students' union files, and a run recorded with
// its fingerprint for every file taken.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { ensureSystemAccounts, postEntries } from '#modules/finance'
import { closePeriod, reopenPeriod } from '../../../finance/server/close'
import starterListener from '../../server/listeners/starter-profile'
import profilesGet from '../../server/api/invoicing/exports/profiles.get'
import profilesPost from '../../server/api/invoicing/exports/profiles.post'
import profileGet from '../../server/api/invoicing/exports/profiles/[id].get'
import profilePatch from '../../server/api/invoicing/exports/profiles/[id].patch'
import codesPut from '../../server/api/invoicing/exports/profiles/[id]/codes.put'
import coverageGet from '../../server/api/invoicing/exports/coverage.get'
import fileGet from '../../server/api/invoicing/exports/file.get'
import runsGet from '../../server/api/invoicing/exports/runs.get'
import checkGet from '../../server/api/invoicing/exports/runs/[id]/check.get'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_24 = Date.UTC(2026, 10, 24, 12)
const handle = server({
  'GET /api/invoicing/exports/profiles': profilesGet,
  'POST /api/invoicing/exports/profiles': profilesPost,
  'GET /api/invoicing/exports/profiles/:id': profileGet,
  'PATCH /api/invoicing/exports/profiles/:id': profilePatch,
  'PUT /api/invoicing/exports/profiles/:id/codes': codesPut,
  'GET /api/invoicing/exports/coverage': coverageGet,
  'GET /api/invoicing/exports/file': fileGet,
  'GET /api/invoicing/exports/runs': runsGet,
  'GET /api/invoicing/exports/runs/:id/check': checkGet,
})
const treasurer = person(['invoicing.export.manage', 'invoicing.settings.manage', 'finance.ledger.view'], { reassertedAt: NOV_24 })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

// Payments posts a sale: the money to the bank, the income to the owner's account.
const sale = (key: string, at: number, amount: number, productionId: string, kind: 'sale' | 'refund' = 'sale') => commit(unit => postEntries(unit.view(), {
  key,
  source: { module: 'payments', type: 'payments.intent', id: key },
  kind,
  occurredAt: at,
  entries: [
    { account: { key: 'payments.bank' }, amountMinor: amount },
    { account: { key: 'tickets.income' }, amountMinor: -amount, forModule: 'tickets', productionId },
  ],
}))

const send = async (method: string, path: string, body?: unknown, actor = treasurer) => {
  const response = await call(handle, method, path, { actor, body })
  const text = await response.text()
  return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) }
}
const file = (profileId: string, from: string, to: string, actor = treasurer) => send('GET', `/api/invoicing/exports/file?profileId=${profileId}&from=${from}&to=${to}`, undefined, actor)
const csvRows = (text: string) => text.trimEnd().split('\r\n').map(line => line.split(','))
let journal: string
let union: string
let incomeId: string
let bankId: string

async function closeAllBefore(day: string) {
  for (const p of await rows<{ id: string }>('SELECT id FROM finance_periods WHERE ends_on < ? ORDER BY starts_on', day)) {
    const closed = await rows<{ action: string }>('SELECT action FROM finance_period_closes WHERE period_id = ? ORDER BY at DESC, id DESC LIMIT 1', p.id)
    if (closed[0]?.action !== 'close') await commit(unit => closePeriod(unit.view(), p.id))
  }
}

beforeAll(async () => {
  setClock(NOV_24)
  for (const id of ['finance', 'payments', 'tickets', 'invoicing']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  await commit(async (unit) => {
    for (const id of ['payments', 'tickets', 'invoicing']) await ensureSystemAccounts(unit.view(), id)
  })
  for (const [id, title] of [['prd_hamlet', 'Hamlet'], ['prd_formula', '=SUM(A1)']]) {
    await env.DB.prepare("INSERT INTO core_productions (id, slug, title, kind, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, ?, 'visiting', 'draft', 1, 1, 0, 0, ?)")
      .bind(id, id, title, NOV_24).run()
  }
  // 00:30 on 1 August in London is 23:30 on 31 July in UTC: the new finance year's first sale.
  await sale('s-aug', Date.UTC(2026, 6, 31, 23, 30), 700, 'prd_hamlet')
  await sale('s-oct-1', Date.UTC(2026, 9, 5, 12), 2000, 'prd_hamlet')
  await sale('s-oct-2', Date.UTC(2026, 9, 5, 18), 1500, 'prd_formula')
  await sale('r-oct', Date.UTC(2026, 9, 6, 12), -500, 'prd_hamlet', 'refund')
  await sale('s-nov', Date.UTC(2026, 10, 20, 12), 300, 'prd_hamlet')
  await closeAllBefore('2026-11-01')
  const [income] = await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'tickets.income'")
  const [bank] = await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'payments.bank'")
  incomeId = income!.id
  bankId = bank!.id
})

describe('switching the module on (IE-01)', () => {
  it('makes the starter profile once: the union\'s under the students\' society preset', async () => {
    await commit(unit => changeSetting(unit.view(), 'invoicing.exports.starter', 'union', { reason: 'test', confirm: true }))
    await commit(unit => starterListener({ payload: { moduleId: 'invoicing' } } as any, unit.view()))
    await commit(unit => starterListener({ payload: { moduleId: 'invoicing' } } as any, unit.view()))
    const made = await rows<{ id: string, name: string, format: string }>('SELECT id, name, format FROM invoicing_export_profiles')
    expect(made).toEqual([expect.objectContaining({ name: 'Students\' union return', format: 'custom' })])
    union = made[0]!.id
    const accounts = await rows<{ system_key: string }>("SELECT system_key FROM finance_accounts WHERE module = 'invoicing' ORDER BY system_key")
    expect(accounts.map(a => a.system_key)).toEqual(['invoicing.bad-debts', 'invoicing.general-expenses', 'invoicing.other-income', 'invoicing.payable', 'invoicing.receivable'])
  })
})

describe('profiles and codes (IE-02)', () => {
  it('makes a journal profile and refuses a second of the same name', async () => {
    const made = await send('POST', '/api/invoicing/exports/profiles', { starter: 'journal', name: 'Accounts' })
    expect(made.status).toBe(200)
    journal = made.json().id
    expect((await send('POST', '/api/invoicing/exports/profiles', { starter: 'journal', name: 'Accounts' })).json()).toMatchObject({ code: 'invoicing.profile.name-taken' })
  })

  it('lists every account with entries, none with a code yet', async () => {
    const shown = (await send('GET', `/api/invoicing/exports/profiles/${journal}`)).json()
    const income = shown.accounts.find((a: any) => a.id === incomeId)
    expect(income).toMatchObject({ used: true, money: false, codes: [] })
    expect(shown.accounts.find((a: any) => a.id === bankId)).toMatchObject({ used: true, money: true })
  })

  it('warns before download of every line with no code, by account (E-05, E-08)', async () => {
    const shown = (await send('GET', `/api/invoicing/exports/coverage?profileId=${journal}&from=2026-10-01&to=2026-10-31`)).json()
    expect(shown).toMatchObject({ from: '2026-10-01', to: '2026-10-31', lines: 6, unmappedLines: 6, closed: true, tooMany: false })
    expect(shown.unmappedAccounts.map((a: any) => a.lines)).toEqual([3, 3])
  })

  it('sets a code per account and one for a kind, auditing old and new (E-06, E-14)', async () => {
    for (const body of [
      { accountId: incomeId, postingKind: null, code: '4000', codeName: 'Box office income' },
      { accountId: bankId, postingKind: null, code: '1200', codeName: 'Bank' },
      { accountId: incomeId, postingKind: 'refund', code: '4010', codeName: 'Refunds' },
    ]) expect((await send('PUT', `/api/invoicing/exports/profiles/${journal}/codes`, body)).status).toBe(200)
    await send('PUT', `/api/invoicing/exports/profiles/${journal}/codes`, { accountId: incomeId, postingKind: null, code: '4001', codeName: 'Box office income' })
    const audit = await rows<{ detail: string }>("SELECT detail FROM core_audit WHERE record_id = ? AND action = 'update' ORDER BY at, id", journal)
    expect(JSON.parse(audit.at(-1)!.detail)).toMatchObject({ accountId: incomeId, postingKind: null, before: '4000', after: '4001' })
    expect((await send('PUT', `/api/invoicing/exports/profiles/${journal}/codes`, { accountId: incomeId, postingKind: null, code: 'four thousand', codeName: '' })).status).toBe(422)
    const coverage = (await send('GET', `/api/invoicing/exports/coverage?profileId=${journal}&from=2026-10-01&to=2026-10-31`)).json()
    expect(coverage.unmappedLines).toBe(0)
  })

  it('reads Open while any day of the range is in an open period, and when a closed one is reopened', async () => {
    expect((await send('GET', `/api/invoicing/exports/coverage?profileId=${journal}&from=2026-10-01&to=2026-11-30`)).json()).toMatchObject({ closed: false, lines: 8 })
    const [october] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-10-01'")
    const { listTerms } = await import('#modules/core')
    const [reason] = await inContext(() => listTerms('finance.reopen-reason'))
    await commit(unit => reopenPeriod(unit.view(), october!.id, reason!.id))
    expect((await send('GET', `/api/invoicing/exports/coverage?profileId=${journal}&from=2026-10-01&to=2026-10-31`)).json().closed).toBe(false)
    await commit(unit => closePeriod(unit.view(), october!.id))
    expect((await send('GET', `/api/invoicing/exports/coverage?profileId=${journal}&from=2026-10-01&to=2026-10-31`)).json().closed).toBe(true)
  })

  it('needs the ledger as well as exports to see what a file covers or take one', async () => {
    const exportsOnly = person(['invoicing.export.take'])
    expect((await send('GET', `/api/invoicing/exports/coverage?profileId=${journal}&from=2026-10-01&to=2026-10-31`, undefined, exportsOnly)).status).toBe(403)
    expect((await file(journal, '2026-10-01', '2026-10-31', exportsOnly)).status).toBe(403)
    expect((await file(journal, '2026-10-01', '2026-10-31', person(['finance.ledger.view']))).status).toBe(403)
  })
})

describe('the journal (IE-06)', () => {
  it('writes every entry once, balanced, in major units, with a kind\'s own code and formulas guarded (E-02, E-04, E-06, E-10, E-11)', async () => {
    const taken = await file(journal, '2026-10-01', '2026-10-31')
    expect(taken.status).toBe(200)
    expect(taken.headers.get('content-type')).toContain('text/csv')
    const [head, ...lines] = csvRows(taken.text)
    expect(head).toEqual(['Date', 'Journal', 'Account code', 'Account name', 'Description', 'Debit', 'Credit', 'Currency', 'Production', 'Source'])
    expect(lines).toHaveLength(6)
    const sum = (i: number) => lines.reduce((n, l) => n + Number(l[i] || 0), 0)
    expect(sum(5)).toBeCloseTo(sum(6))
    // Entries of one posting come in a fixed order, though not the order they were written.
    expect(lines.map(l => l[2]).sort()).toEqual(['1200', '1200', '1200', '4001', '4001', '4010'])
    expect(lines).toContainEqual(expect.arrayContaining(['1200', '20.00', '']))
    expect(lines.find(l => l[2] === '4001' && l[8] === 'Hamlet')!.slice(5, 9)).toEqual(['', '20.00', 'GBP', 'Hamlet'])
    expect(lines.filter(l => l[2] === '4001').map(l => l[8])).toContain('\'=SUM(A1)')
    // A refund's money goes out: a credit to the bank, written as a plain number.
    expect(lines.find(l => l[2] === '1200' && l[6] === '5.00')!.slice(5, 7)).toEqual(['', '5.00'])
    expect(lines.find(l => l[2] === '4010')!.slice(5, 7)).toEqual(['5.00', ''])
  })

  it('records the run with its fingerprint and the map digest (E-09)', async () => {
    const taken = await file(journal, '2026-10-01', '2026-10-31')
    const runId = taken.headers.get('x-export-run')!
    const [run] = await rows<{ rows: number, unmapped_rows: number, closed: number, sha256: string, map_version: string }>('SELECT * FROM invoicing_export_runs WHERE id = ?', runId)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(taken.text))
    expect(run).toMatchObject({ rows: 6, unmapped_rows: 0, closed: 1, sha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') })
    expect(taken.headers.get('x-export-same-as')).not.toBeNull()
  })

  it('sums a day\'s entries per account and kind code, keeping the file balanced (E-03)', async () => {
    expect((await send('PATCH', `/api/invoicing/exports/profiles/${journal}`, { granularity: 'daily', signs: 'signed', dateFormat: 'dmy' })).status).toBe(200)
    const [head, ...lines] = csvRows((await file(journal, '2026-10-01', '2026-10-31')).text)
    expect(head).toContain('Amount')
    expect(lines.map(l => [l[0], l[1], l[2], l[5]]).sort((a, b) => a.join().localeCompare(b.join()))).toEqual([
      ['05/10/2026', '2026-10-05', '1200', '35.00'],
      ['05/10/2026', '2026-10-05', '4001', '-35.00'],
      ['06/10/2026', '2026-10-06', '1200', '-5.00'],
      ['06/10/2026', '2026-10-06', '4010', '5.00'],
    ])
    await send('PATCH', `/api/invoicing/exports/profiles/${journal}`, { granularity: 'entry', signs: 'split', dateFormat: 'iso' })
  })
})

describe('the students\' union return (IE-04)', () => {
  it('keeps the old six leading columns, sales positive and refunds negative, with the money total last', async () => {
    await send('PUT', `/api/invoicing/exports/profiles/${union}/codes`, { accountId: incomeId, postingKind: null, code: '4000', codeName: '' })
    const taken = await file(union, '2026-10-01', '2026-10-31')
    const [head, ...lines] = csvRows(taken.text)
    expect(head).toEqual(['date', 'category', 'tender', 'nominalCode', 'amountPence', 'amountPounds', 'time', 'source', 'show', 'reference'])
    expect(lines).toHaveLength(7)
    const leading = lines.map(l => l.slice(0, 6))
    expect(lines.find(l => l[4] === '2000')!.slice(0, 7)).toEqual(['2026-10-05', 'Sale', 'Not money', '4000', '2000', '20.00', '13:00'])
    expect(leading).toContainEqual(['2026-10-05', 'Sale', 'Money', 'UNMAPPED', '-2000', '-20.00'])
    expect(leading).toContainEqual(['2026-10-06', 'Refund', 'Not money', '4000', '-500', '-5.00'])
    expect(leading).toContainEqual(['2026-10-06', 'Refund', 'Money', 'UNMAPPED', '500', '5.00'])
    expect(taken.text.trimEnd().split('\r\n').at(-1)).toBe(',"Card total, the same as the money dashboard\'s revenue",,,3000,30.00,,,,')
  })

  it('counts days in the theatre\'s time, not UTC (E-01)', async () => {
    const august = csvRows((await file(union, '2026-08-01', '2026-08-01')).text)
    expect(august).toHaveLength(4)
    expect(august.slice(1, 3).map(l => [l[0], l[1], l[6]])).toEqual([['2026-08-01', 'Sale', '00:30'], ['2026-08-01', 'Sale', '00:30']])
    const july = csvRows((await file(union, '2026-07-31', '2026-07-31')).text)
    expect(july).toHaveLength(2) // the heading and a total line of nothing
  })

  it('gives the same bytes for a closed range taken again, and says Would differ once a code changes (E-09, E-14)', async () => {
    const first = await file(union, '2026-10-01', '2026-10-31')
    const again = await file(union, '2026-10-01', '2026-10-31')
    expect(again.text).toBe(first.text)
    expect(again.headers.get('x-export-same-as')).not.toBeNull()
    const runId = again.headers.get('x-export-run')!
    expect((await send('GET', `/api/invoicing/exports/runs/${runId}/check`)).json()).toEqual({ same: true, mapChanged: false })
    await send('PUT', `/api/invoicing/exports/profiles/${union}/codes`, { accountId: bankId, postingKind: null, code: '1200', codeName: '' })
    const runs = (await send('GET', `/api/invoicing/exports/runs?profileId=${union}`)).json().runs
    expect(runs.find((r: any) => r.id === runId)).toMatchObject({ mapChanged: true, closed: true, rows: 6 })
    expect((await send('GET', `/api/invoicing/exports/runs/${runId}/check`)).json()).toEqual({ same: false, mapChanged: true })
  })

  it('lists the profiles for the Exports screen, opening the union\'s on the finance year', async () => {
    const listed = (await send('GET', '/api/invoicing/exports/profiles')).json()
    expect(listed.profiles.find((p: any) => p.id === union).opening).toEqual({ from: '2026-08-01', to: '2027-07-31' })
    expect(listed.profiles.find((p: any) => p.id === journal).opening).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })
})
