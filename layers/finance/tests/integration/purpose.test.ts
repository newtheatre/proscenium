// The Finance amendment Budgets and Invoices share (Budgets and claims, part 4, "Asked of Finance";
// Invoices and exports, part 4, F-A1): a posting's purpose without new kinds, a budget line tag on
// entries, the accounts given to a module, and Invoices writing an owner's entries as Payments does.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { postEntries, reversePosting, balances, accountsOf } from '../../server/services'
import { PURPOSES } from '../../server/ledger'
import { env, inContext, rows, setModule } from '../../../../tests/integration/helpers'

const NOV_20 = Date.UTC(2026, 10, 20, 12)

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

const move = (key: string, amount: number, extra: Record<string, unknown> = {}) => ({
  key,
  source: { module: 'tickets', type: 'tickets.order', id: key },
  kind: 'transfer' as const,
  entries: [
    { account: { key: 'tickets.income' }, amountMinor: amount, budgetLineId: 'bgl_lights' },
    { account: { key: 'tickets.deferred' }, amountMinor: -amount },
  ],
  ...extra,
})

beforeAll(async () => {
  setClock(NOV_20)
  for (const id of ['finance', 'payments', 'tickets', 'snacks']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
})

describe('a posting\'s purpose', () => {
  it('lists exactly the purposes Budgets and Invoices asked for', () => {
    expect([...PURPOSES]).toEqual(['expense', 'disbursement', 'bill', 'invoice', 'credit_note', 'write_off'])
  })

  it('is stored on a transfer and read back by balances', async () => {
    const id = await commit(unit => postEntries(unit.view(), move('purpose:bill:1', 1200, { purpose: 'bill' })))
    const [row] = await rows<{ purpose: string, kind: string }>('SELECT purpose, kind FROM finance_postings WHERE id = ?', id)
    expect(row).toEqual({ purpose: 'bill', kind: 'transfer' })
    const bills = await inContext(() => balances({ purposes: ['bill'] }))
    expect(bills.find(b => b.systemKey === 'tickets.income')?.debitsMinor).toBe(1200)
    expect(await inContext(() => balances({ purposes: ['invoice'] }))).toEqual([])
  })

  it('is refused when it is not on the list, or set on a kind other than transfer', async () => {
    await expect(commit(unit => postEntries(unit.view(), move('purpose:odd', 100, { purpose: 'gift' as never })))).rejects.toThrow(/purpose/)
    await expect(commit(unit => postEntries(unit.view(), { ...move('purpose:sale', 100, { purpose: 'invoice' }), kind: 'sale' }))).rejects.toThrow(/transfer/)
    expect(await rows("SELECT id FROM finance_postings WHERE idempotency_key IN ('purpose:odd', 'purpose:sale')")).toEqual([])
  })

  it('is left null for a posting that has none', async () => {
    const id = await commit(unit => postEntries(unit.view(), move('purpose:none', 300)))
    const [row] = await rows<{ purpose: string | null }>('SELECT purpose FROM finance_postings WHERE id = ?', id)
    expect(row!.purpose).toBeNull()
  })

  it('is kept by a reversal, with each entry\'s budget line, so the correction reads as what it undoes', async () => {
    const [original] = await rows<{ id: string }>("SELECT id FROM finance_postings WHERE idempotency_key = 'purpose:bill:1'")
    const id = await commit(unit => reversePosting(unit.view(), original!.id))
    const [row] = await rows<{ purpose: string, kind: string }>('SELECT purpose, kind FROM finance_postings WHERE id = ?', id)
    expect(row).toEqual({ purpose: 'bill', kind: 'correction' })
    const lines = await rows<{ budget_line_id: string | null, amount_minor: number }>('SELECT budget_line_id, amount_minor FROM finance_entries WHERE posting_id = ? ORDER BY amount_minor', id)
    expect(lines).toEqual([{ budget_line_id: 'bgl_lights', amount_minor: -1200 }, { budget_line_id: null, amount_minor: 1200 }])
  })
})

describe('a budget line tag', () => {
  it('is stored per entry and filters balances, through a subquery for any number of lines', async () => {
    await commit(unit => postEntries(unit.view(), move('line:a', 500)))
    const lines = Array.from({ length: 120 }, (_, i) => `bgl_${i}`)
    const tagged = await inContext(() => balances({ budgetLineIds: [...lines, 'bgl_lights'] }))
    // purpose:bill:1 (1200) and its reversal (-1200), purpose:none (300) and line:a (500).
    expect(tagged).toHaveLength(1)
    expect(tagged[0]).toMatchObject({ systemKey: 'tickets.income', debitsMinor: 2000, creditsMinor: 1200, balanceMinor: 800 })
    expect(await inContext(() => balances({ budgetLineIds: ['bgl_nothing'] }))).toEqual([])
  })

  it('is never written on an entry of an append-only posting after the fact', async () => {
    await expect(env.DB.prepare("UPDATE finance_entries SET budget_line_id = 'bgl_other' WHERE budget_line_id = 'bgl_lights'").run()).rejects.toThrow(/append-only/)
    await expect(env.DB.prepare("UPDATE finance_postings SET purpose = 'invoice' WHERE purpose = 'bill'").run()).rejects.toThrow(/append-only/)
  })
})

describe('accounts given to a module', () => {
  it('lists a module\'s active accounts, optionally of one kind, without reading the table elsewhere', async () => {
    const all = await inContext(() => accountsOf('tickets'))
    expect(all.map(a => a.systemKey)).toEqual(expect.arrayContaining(['tickets.income', 'tickets.deferred']))
    expect(all.every(a => a.module === 'tickets')).toBe(true)
    const income = await inContext(() => accountsOf('tickets', 'income'))
    expect(income.map(a => a.systemKey)).toEqual(['tickets.income'])
    await env.DB.prepare("UPDATE finance_accounts SET active = 0 WHERE system_key = 'tickets.deferred'").run()
    expect((await inContext(() => accountsOf('tickets'))).map(a => a.systemKey)).not.toContain('tickets.deferred')
    await env.DB.prepare("UPDATE finance_accounts SET active = 1 WHERE system_key = 'tickets.deferred'").run()
  })
})

describe('F-A1: Invoices writes an owner\'s entries as Payments does', () => {
  const issue = (key: string, source: string) => ({
    key,
    source: { module: source, type: `${source}.invoice`, id: key },
    kind: 'transfer' as const,
    purpose: 'invoice' as const,
    entries: [
      { account: { key: 'tickets.deferred' }, amountMinor: 900, forModule: 'tickets' },
      { account: { key: 'tickets.income' }, amountMinor: -900, forModule: 'tickets' },
    ],
  })

  it('lets a posting from invoicing carry entries for another module', async () => {
    const id = await commit(unit => postEntries(unit.view(), issue('fa1:invoicing', 'invoicing')))
    expect(await rows('SELECT posting_id FROM finance_seals WHERE posting_id = ?', id)).toHaveLength(1)
  })

  it('still refuses any other module doing so, in the service and in the trigger', async () => {
    await expect(commit(unit => postEntries(unit.view(), issue('fa1:snacks', 'snacks')))).rejects.toMatchObject({ code: 'finance.entry.wrong-module' })
    const [account] = await rows<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = 'tickets.income'")
    const [period] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-11-01'")
    await env.DB.prepare("INSERT INTO finance_postings (id, idempotency_key, source_module, source_type, source_id, kind, period_id, occurred_at, posted_at) VALUES ('post_raw', 'raw', 'snacks', 'snacks.x', 'x', 'transfer', ?, 1, 1)").bind(period!.id).run()
    await expect(env.DB.prepare("INSERT INTO finance_entries (id, posting_id, account_id, amount_minor, currency, for_module, tax_code, tax_minor, created_at) VALUES ('led_raw', 'post_raw', ?, 5, 'GBP', 'tickets', 'none', 0, 1)").bind(account!.id).run()).rejects.toThrow(/own active accounts/)
  })
})
