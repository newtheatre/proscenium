// F-A2 (Invoices and exports, part 4): VAT registration with a number and a scheme, the VAT codes and
// their fixed rates, Finance's two VAT accounts, tax on entries, and the two reads other modules use
// instead of Finance's tables: entryRows and taxTotals.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { postEntries, reversePosting, entryRows, taxTotals, listTaxCodes, ensureSystemAccounts } from '../../server/services'
import codesRoute from '../../server/api/finance/tax-codes.get'
import addRoute from '../../server/api/finance/tax-codes.post'
import changeRoute from '../../server/api/finance/tax-codes/[code].patch'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_21 = Date.UTC(2026, 10, 21, 12)
const DAY = 86_400_000

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

// A VAT sale the way Invoices posts one (rule I-44): the net to income with its code, the VAT to
// Finance's output account, the gross to what is owed.
const vatSale = (key: string, net: number, vat: number, at = NOV_21) => ({
  key,
  source: { module: 'invoicing', type: 'invoicing.invoice', id: key },
  kind: 'transfer' as const,
  purpose: 'invoice' as const,
  occurredAt: at,
  entries: [
    { account: { key: 'tickets.deferred' }, amountMinor: net + vat, forModule: 'tickets' },
    { account: { key: 'tickets.income' }, amountMinor: -net, forModule: 'tickets', taxCode: 'standard', taxMinor: -vat },
    { account: { key: 'finance.vat-output' }, amountMinor: -vat, forModule: 'finance' },
  ],
})

const range = { startsAt: NOV_21 - DAY, endsAt: NOV_21 + 2 * DAY }

beforeAll(async () => {
  setClock(NOV_21)
  for (const id of ['finance', 'payments', 'tickets']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
})

describe('registering for VAT', () => {
  it('cannot be turned on without a VAT number, and takes one of the right shape', async () => {
    await expect(commit(unit => changeSetting(unit.view(), 'finance.tax.registered', true, { reason: 'test', confirm: true }))).rejects.toThrow()
    await expect(commit(unit => changeSetting(unit.view(), 'finance.tax.number', 'GB12345', { reason: 'test', confirm: true }))).rejects.toThrow()
    await commit(unit => changeSetting(unit.view(), 'finance.tax.number', 'GB123456789', { reason: 'test', confirm: true }))
    await commit(unit => changeSetting(unit.view(), 'finance.tax.registered', true, { reason: 'test', confirm: true }))
    await commit(unit => changeSetting(unit.view(), 'finance.tax.scheme', 'cash', { reason: 'test', confirm: true }))
    await expect(commit(unit => changeSetting(unit.view(), 'finance.tax.scheme', 'flat', { reason: 'test', confirm: true }))).rejects.toThrow()
  })
})

describe('tax codes', () => {
  it('ship the VAT rates beside none, with none and outside off the return', async () => {
    const codes = await inContext(() => listTaxCodes())
    expect(codes.map(c => [c.code, c.rateBasisPoints, c.inScope])).toEqual([
      ['none', 0, false], ['standard', 2000, true], ['reduced', 500, true], ['exempt', 0, true], ['outside', 0, false], ['zero', 0, true],
    ])
  })

  it('an unused code\'s rate may change; a used one\'s never does, even straight to the database', async () => {
    await env.DB.prepare("UPDATE finance_tax_codes SET rate_basis_points = 600 WHERE code = 'reduced'").run()
    await env.DB.prepare("UPDATE finance_tax_codes SET rate_basis_points = 500 WHERE code = 'reduced'").run()
    await commit(unit => postEntries(unit.view(), vatSale('vat:1', 1000, 200)))
    await expect(env.DB.prepare("UPDATE finance_tax_codes SET rate_basis_points = 1750 WHERE code = 'standard'").run()).rejects.toThrow(/keeps its rate/)
    await expect(env.DB.prepare("DELETE FROM finance_tax_codes WHERE code = 'standard'").run()).rejects.toThrow(/never deleted/)
    await expect(env.DB.prepare("UPDATE finance_tax_codes SET rate_basis_points = 1 WHERE code = 'none'").run()).rejects.toThrow(/keeps its rate/)
    // Its name and whether it is offered may still change.
    await env.DB.prepare("UPDATE finance_tax_codes SET label = 'Standard rate VAT' WHERE code = 'standard'").run()
  })
})

describe('tax on entries', () => {
  it('stores each entry\'s code and tax, with the VAT on Finance\'s output account', async () => {
    const lines = await rows<{ system_key: string, amount_minor: number, tax_code: string, tax_minor: number, for_module: string }>(
      "SELECT a.system_key, e.amount_minor, e.tax_code, e.tax_minor, e.for_module FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id WHERE p.idempotency_key = 'vat:1' ORDER BY e.amount_minor")
    expect(lines).toEqual([
      { system_key: 'tickets.income', amount_minor: -1000, tax_code: 'standard', tax_minor: -200, for_module: 'tickets' },
      { system_key: 'finance.vat-output', amount_minor: -200, tax_code: 'none', tax_minor: 0, for_module: 'finance' },
      { system_key: 'tickets.deferred', amount_minor: 1200, tax_code: 'none', tax_minor: 0, for_module: 'tickets' },
    ])
    await commit(unit => ensureSystemAccounts(unit.view(), 'finance'))
    const [account] = await rows<{ kind: string, module: string }>("SELECT kind, module FROM finance_accounts WHERE system_key = 'finance.vat-input'")
    expect(account).toEqual({ kind: 'asset', module: 'finance' })
  })

  it('refuses an unknown code, tax with none, and tax signed unlike its entry; a stopped code stays on what uses it', async () => {
    const bad = (key: string, taxCode: string, taxMinor: number) => ({ ...vatSale(key, 100, 20), entries: [
      { account: { key: 'tickets.deferred' }, amountMinor: 120, forModule: 'tickets' },
      { account: { key: 'tickets.income' }, amountMinor: -100, forModule: 'tickets', taxCode, taxMinor },
      { account: { key: 'finance.vat-output' }, amountMinor: -20, forModule: 'finance' },
    ] })
    await expect(commit(unit => postEntries(unit.view(), bad('vat:x1', 'luxury', -20)))).rejects.toMatchObject({ code: 'finance.tax-code.missing' })
    await env.DB.prepare("UPDATE finance_tax_codes SET active = 0 WHERE code = 'reduced'").run()
    // A price set while the code was offered still sells, and refunds, after it stops being offered.
    await commit(unit => postEntries(unit.view(), { ...bad('vat:x2', 'reduced', -20), occurredAt: NOV_21 + 10 * DAY }))
    await env.DB.prepare("UPDATE finance_tax_codes SET active = 1 WHERE code = 'reduced'").run()
    await expect(commit(unit => postEntries(unit.view(), bad('vat:x3', 'none', -20)))).rejects.toThrow(/code none/)
    await expect(commit(unit => postEntries(unit.view(), bad('vat:x4', 'standard', 20)))).rejects.toThrow(/signed unlike/)
  })

  it('reverses code and tax with the amounts', async () => {
    const [original] = await rows<{ id: string }>("SELECT id FROM finance_postings WHERE idempotency_key = 'vat:1'")
    await commit(unit => postEntries(unit.view(), vatSale('vat:2', 500, 100, NOV_21 + DAY)))
    const id = await commit(unit => reversePosting(unit.view(), original!.id, { occurredAt: NOV_21 + DAY }))
    const [line] = await rows<{ tax_code: string, tax_minor: number, amount_minor: number }>("SELECT tax_code, tax_minor, amount_minor FROM finance_entries WHERE posting_id = ? AND tax_code = 'standard'", id)
    expect(line).toEqual({ tax_code: 'standard', tax_minor: 200, amount_minor: 1000 })
  })
})

describe('entryRows', () => {
  it('pages sealed entries oldest first, each with its posting, account, tags and tax', async () => {
    const first = await inContext(() => entryRows(range, { limit: 4 }))
    expect(first).toHaveLength(4)
    const rest = await inContext(() => entryRows(range, { limit: 100, afterId: first.at(-1)!.entryId }))
    const all = [...first, ...rest]
    // vat:1, then vat:2 and the reversal a day later: three entries each.
    expect(all).toHaveLength(9)
    expect(new Set(all.map(r => r.entryId)).size).toBe(9)
    expect(all.map(r => r.occurredAt)).toEqual([...all.map(r => r.occurredAt)].sort((a, b) => a - b))
    const income = all.find(r => r.systemKey === 'tickets.income')!
    expect(income).toMatchObject({ kind: 'transfer', purpose: 'invoice', source: { module: 'invoicing', type: 'invoicing.invoice', id: 'vat:1' }, accountCode: 'tickets.income', accountKind: 'income', amountMinor: -1000, currency: 'GBP', forModule: 'tickets', taxCode: 'standard', taxMinor: -200 })
    expect(await inContext(() => entryRows({ startsAt: 0, endsAt: 1 }, { limit: 10 }))).toEqual([])
  })
})

describe('taxTotals', () => {
  it('sums net and tax by code and account kind, and the two VAT accounts apart', async () => {
    const totals = await inContext(() => taxTotals(range))
    // vat:1 (net 1000, VAT 200), vat:2 (500, 100) and vat:1 reversed.
    expect(totals).toEqual([
      { taxCode: 'none', accountKind: 'liability', vatAccount: 'output', currency: 'GBP', amountMinor: -100, taxMinor: 0, entries: 3 },
      { taxCode: 'standard', accountKind: 'income', vatAccount: null, currency: 'GBP', amountMinor: -500, taxMinor: -100, entries: 3 },
    ])
    expect(await inContext(() => taxTotals(range, { exceptModules: ['invoicing'] }))).toEqual([])
  })
})

describe('the Tax codes screen', () => {
  const handle = server({
    'GET /api/finance/tax-codes': codesRoute,
    'POST /api/finance/tax-codes': addRoute,
    'PATCH /api/finance/tax-codes/:code': changeRoute,
  })
  const treasurer = person(['finance.settings.manage'])

  it('lists the codes with whether each is used, to the treasurer only', async () => {
    const shown = await call(handle, 'GET', '/api/finance/tax-codes', { actor: treasurer })
    const body = await shown.json() as { codes: { code: string, used: boolean }[] }
    expect(body.codes.find(c => c.code === 'standard')?.used).toBe(true)
    expect(body.codes.find(c => c.code === 'zero')?.used).toBe(false)
    expect((await call(handle, 'GET', '/api/finance/tax-codes', { actor: person(['finance.ledger.view']) })).status).toBe(403)
  })

  it('adds a code for a new rate, and refuses a code that exists', async () => {
    const added = await call(handle, 'POST', '/api/finance/tax-codes', { actor: treasurer, body: { code: 'standard-2027', label: 'Standard rate from 2027', rateBasisPoints: 2100, inScope: true }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(added.status).toBe(200)
    const again = await call(handle, 'POST', '/api/finance/tax-codes', { actor: treasurer, body: { code: 'standard', label: 'Again', rateBasisPoints: 2000, inScope: true }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'finance.tax-code.taken' })
  })

  it('renames and stops a used code but will not change its rate; none is always offered', async () => {
    const renamed = await call(handle, 'PATCH', '/api/finance/tax-codes/standard', { actor: treasurer, body: { label: 'Standard (20%)', active: false } })
    expect(renamed.status).toBe(200)
    const [row] = await rows<{ label: string, active: number }>("SELECT label, active FROM finance_tax_codes WHERE code = 'standard'")
    expect(row).toEqual({ label: 'Standard (20%)', active: 0 })
    const rate = await call(handle, 'PATCH', '/api/finance/tax-codes/standard', { actor: treasurer, body: { rateBasisPoints: 2100 } })
    expect(await rate.json()).toMatchObject({ code: 'finance.tax-code.used' })
    expect((await call(handle, 'PATCH', '/api/finance/tax-codes/zero', { actor: treasurer, body: { rateBasisPoints: 10 } })).status).toBe(200)
    expect(await (await call(handle, 'PATCH', '/api/finance/tax-codes/none', { actor: treasurer, body: { active: false } })).json()).toMatchObject({ code: 'finance.tax-code.none' })
  })
})
