// FIN-01, FIN-02 and FIN-03's service (Box office specification, part 8, "The ledger"): a posting
// balances or does not exist, the ledger is append-only, nothing posts twice, a closed period refuses
// postings and a late fact lands in the next open one, a reversal is exact and happens once, and a
// module posts only to its own accounts. The stand-in owners are the fixtures tickets and snacks.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { postEntries, reversePosting, balances, accountFor, ensureSystemAccounts, ensureScopedAccount, isPeriodOpen } from '../../server/services'
import { closePeriod, reopenPeriod, closeBlockers } from '../../server/close'
import { listPeriods, getPeriod } from '../../server/periods'
import closeRoute from '../../server/api/finance/periods/[id]/close.post'
import periodRoute from '../../server/api/finance/periods/[id].get'
import reverseRoute from '../../server/api/finance/postings/[id]/reverse.post'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const OCT_10 = Date.UTC(2026, 9, 10, 12)
const NOV_16 = Date.UTC(2026, 10, 16, 12)

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

function sale(key: string, amount: number, occurredAt?: number) {
  return {
    key,
    source: { module: 'tickets', type: 'tickets.order', id: key },
    kind: 'sale' as const,
    occurredAt,
    entries: [
      { account: { key: 'tickets.cash' }, amountMinor: amount },
      { account: { key: 'tickets.income' }, amountMinor: -amount },
    ],
  }
}

const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'tickets', 'snacks']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
})

describe('accounts a module declares', () => {
  it('are made locked to the module when it is switched on, keyed <module>.<key>, coded by the key', async () => {
    await commit(unit => ensureSystemAccounts(unit.view(), 'snacks'))
    const [row] = await rows<{ code: string, name: string, kind: string, module: string, system_key: string }>("SELECT * FROM finance_accounts WHERE system_key = 'snacks.income'")
    expect(row).toMatchObject({ code: 'snacks.income', name: 'Snack income', kind: 'income', module: 'snacks' })
    await commit(unit => ensureSystemAccounts(unit.view(), 'snacks'))
    expect(await count("SELECT count(*) AS n FROM finance_accounts WHERE system_key = 'snacks.income'")).toBe(1)
  })

  it('makes a scoped account once per record, and refuses a key that is not declared scoped', async () => {
    await commit(unit => ensureScopedAccount(unit.view(), 'tickets.clearing', 'ppa_one'))
    await commit(unit => ensureScopedAccount(unit.view(), 'tickets.clearing', 'ppa_one'))
    await commit(unit => ensureScopedAccount(unit.view(), 'tickets.clearing', 'ppa_two'))
    expect(await count("SELECT count(*) AS n FROM finance_accounts WHERE system_key = 'tickets.clearing'")).toBe(2)
    expect(await inContext(() => accountFor('tickets.clearing', 'ppa_one'))).toMatch(/^lac_/)
    await expect(commit(unit => ensureScopedAccount(unit.view(), 'tickets.income', 'ppa_one'))).rejects.toThrow(/not a scoped account/)
  })

  it('makes a new scoped account once when two postings in one unit both need it', async () => {
    const entries = (amount: number) => [{ account: { key: 'tickets.clearing', scope: 'ppa_three' }, amountMinor: amount }, { account: { key: 'tickets.clearing', scope: 'ppa_four' }, amountMinor: -amount }]
    await commit(async (unit) => {
      await postEntries(unit.view(), { key: 'tickets:three:a', source: { module: 'tickets', type: 'tickets.order', id: 'three-a' }, kind: 'sale', entries: entries(100) })
      await postEntries(unit.view(), { key: 'tickets:three:b', source: { module: 'tickets', type: 'tickets.order', id: 'three-b' }, kind: 'sale', entries: entries(200) })
    })
    expect(await count("SELECT count(*) AS n FROM finance_accounts WHERE system_key = 'tickets.clearing' AND scope IN ('ppa_three', 'ppa_four')")).toBe(2)
    const totals = await inContext(() => balances({ systemKeys: ['tickets.clearing'] }))
    expect(totals.map(b => b.balanceMinor).sort((a, b) => a - b)).toEqual(expect.arrayContaining([-300, 300]))
  })
})

describe('a posting', () => {
  it('is written with its entries and its seal, makes its period, and shows in balances', async () => {
    const id = await commit(unit => postEntries(unit.view(), sale('order-1', 1500)))
    expect(id).toMatch(/^post_/)
    expect(await count('SELECT count(*) AS n FROM finance_entries WHERE posting_id = ?', id)).toBe(2)
    expect(await count('SELECT count(*) AS n FROM finance_seals WHERE posting_id = ?', id)).toBe(1)
    const periods = await inContext(() => listPeriods())
    expect(periods.map(p => p.label)).toContain('November 2026')
    const totals = await inContext(() => balances({ systemKeys: ['tickets.cash', 'tickets.income'] }))
    expect(totals.find(b => b.systemKey === 'tickets.cash')).toMatchObject({ debitsMinor: 1500, creditsMinor: 0, balanceMinor: 1500, currency: 'GBP' })
    expect(totals.find(b => b.systemKey === 'tickets.income')).toMatchObject({ balanceMinor: -1500 })
  })

  it('nothing-posts-twice: the same key a second time fails its batch and adds nothing', async () => {
    const before = await count('SELECT count(*) AS n FROM finance_postings')
    await expect(commit(unit => postEntries(unit.view(), sale('order-1', 1500)))).rejects.toThrow(/UNIQUE/)
    expect(await count('SELECT count(*) AS n FROM finance_postings')).toBe(before)
  })

  it('posting-balances-or-does-not-exist: a penny out, one entry, or two currencies fail and leave no row', async () => {
    const [period] = await rows<{ id: string }>('SELECT id FROM finance_periods ORDER BY starts_on DESC LIMIT 1')
    const cash = (await inContext(() => accountFor('tickets.cash')))!
    const income = (await inContext(() => accountFor('tickets.income')))!
    const attempt = (lines: [string, number, string][], entryCount = lines.length) => {
      const postingId = newId('post')
      return env.DB.batch([
        env.DB.prepare("INSERT INTO finance_postings (id, idempotency_key, source_module, source_type, source_id, kind, period_id, occurred_at, posted_at) VALUES (?, ?, 'tickets', 'tickets.order', 'x', 'sale', ?, 1, 1)").bind(postingId, postingId, period!.id),
        ...lines.map(([account, amount, currency]) => env.DB.prepare('INSERT INTO finance_entries (id, posting_id, account_id, amount_minor, currency, created_at) VALUES (?, ?, ?, ?, ?, 1)').bind(newId('led'), postingId, account, amount, currency)),
        env.DB.prepare('INSERT INTO finance_seals (posting_id, entry_count, created_at) VALUES (?, ?, 1)').bind(postingId, entryCount),
      ])
    }
    const before = await count('SELECT count(*) AS n FROM finance_postings')
    await expect(attempt([[cash, 1001, 'GBP'], [income, -1000, 'GBP']])).rejects.toThrow(/balance/)
    await expect(attempt([[cash, 1000, 'GBP']])).rejects.toThrow(/entry_count|CHECK|balance/)
    await expect(attempt([[cash, 1000, 'GBP'], [income, -1000, 'EUR']])).rejects.toThrow(/balance/)
    await expect(attempt([[cash, 1000, 'GBP'], [income, -1000, 'GBP']], 3)).rejects.toThrow(/balance/)
    expect(await count('SELECT count(*) AS n FROM finance_postings')).toBe(before)
    // The service refuses the same shapes before it builds a batch.
    await expect(commit(unit => postEntries(unit.view(), { ...sale('order-x', 1000), entries: [{ account: { key: 'tickets.cash' }, amountMinor: 1001 }, { account: { key: 'tickets.income' }, amountMinor: -1000 }] }))).rejects.toThrow(/does not balance/)
  })

  it('takes no entry after its seal', async () => {
    const [posting] = await rows<{ id: string }>("SELECT id FROM finance_postings WHERE idempotency_key = 'order-1'")
    const cash = (await inContext(() => accountFor('tickets.cash')))!
    await expect(env.DB.prepare('INSERT INTO finance_entries (id, posting_id, account_id, amount_minor, currency, created_at) VALUES (?, ?, ?, 5, \'GBP\', 1)').bind(newId('led'), posting!.id, cash).run()).rejects.toThrow(/sealed posting/)
  })

  it('ledger-is-append-only: updates and deletes of postings, entries, seals and closes are refused', async () => {
    for (const sql of [
      'UPDATE finance_postings SET kind = \'refund\'',
      'DELETE FROM finance_postings',
      'UPDATE finance_entries SET amount_minor = amount_minor + 1',
      'DELETE FROM finance_entries',
      'UPDATE finance_seals SET entry_count = 9',
      'DELETE FROM finance_seals',
    ]) await expect(env.DB.prepare(sql).run(), sql).rejects.toThrow(/append-only/)
  })
})

describe('accounts belong to one module', () => {
  it('handler-posts-only-to-its-own-accounts: a module cannot post to another module\'s account', async () => {
    await expect(commit(unit => postEntries(unit.view(), {
      ...sale('wrong-1', 300),
      entries: [{ account: { key: 'tickets.cash' }, amountMinor: 300 }, { account: { key: 'snacks.income' }, amountMinor: -300 }],
    }))).rejects.toMatchObject({ code: 'finance.entry.wrong-module' })
    // The database refuses it too, whatever the code says.
    const [period] = await rows<{ id: string }>('SELECT id FROM finance_periods ORDER BY starts_on DESC LIMIT 1')
    const snacks = (await inContext(() => accountFor('snacks.income')))!
    const write = (source: string, forModule: string | null) => {
      const postingId = newId('post')
      return env.DB.batch([
        env.DB.prepare('INSERT INTO finance_postings (id, idempotency_key, source_module, source_type, source_id, kind, period_id, occurred_at, posted_at) VALUES (?, ?, ?, \'x\', \'x\', \'sale\', ?, 1, 1)').bind(postingId, postingId, source, period!.id),
        env.DB.prepare('INSERT INTO finance_entries (id, posting_id, account_id, amount_minor, currency, for_module, created_at) VALUES (?, ?, ?, -1, \'GBP\', ?, 1)').bind(newId('led'), postingId, snacks, forModule),
      ])
    }
    await expect(write('tickets', null)).rejects.toThrow(/own active accounts/)
    await expect(write('tickets', 'snacks')).rejects.toThrow(/own active accounts/)
    await expect(write('payments', null)).rejects.toThrow(/own active accounts/)
    // Payments writing the entries snacks returned for its own part is allowed.
    await expect(write('payments', 'snacks')).resolves.toBeDefined()
  })
})

describe('periods', () => {
  it('a late fact for a period before the first lands in the earliest open period, keeping its true date', async () => {
    const id = await commit(unit => postEntries(unit.view(), sale('order-oct', 700, OCT_10)))
    const [row] = await rows<{ period_id: string, occurred_at: number }>('SELECT period_id, occurred_at FROM finance_postings WHERE id = ?', id)
    expect(row!.occurred_at).toBe(OCT_10)
    const period = await inContext(() => getPeriod(row!.period_id))
    expect(period!.label).toBe('November 2026')
  })

  it('closed-period-refuses-postings: a closed period takes nothing; a late fact goes to the next open period', async () => {
    // Make October exist, then close it.
    await commit(async (unit) => {
      unit.add({ sql: "INSERT INTO finance_periods (id, label, starts_on, ends_on, created_at, updated_at) VALUES (?, 'October 2026', '2026-10-01', '2026-10-31', 1, 1)", params: [newId('fpe')] })
    })
    const [october] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-10-01'")
    const blockers = await inContext(async () => closeBlockers((await getPeriod(october!.id))!))
    expect(blockers).toEqual([])
    await commit(unit => closePeriod(unit.view(), october!.id))
    expect(await inContext(() => isPeriodOpen('2026-10-10'))).toBe(false)
    expect(await inContext(() => isPeriodOpen('2026-11-10'))).toBe(true)

    // The trigger refuses a posting written straight into October.
    await expect(env.DB.prepare("INSERT INTO finance_postings (id, idempotency_key, source_module, source_type, source_id, kind, period_id, occurred_at, posted_at) VALUES (?, 'late', 'tickets', 'x', 'x', 'fee', ?, 1, 1)").bind(newId('post'), october!.id).run()).rejects.toThrow(/closed period/)

    // The service sends a late October fact to November, with its true date.
    const id = await commit(unit => postEntries(unit.view(), sale('order-late', 250, OCT_10)))
    const [row] = await rows<{ period_id: string, occurred_at: number }>('SELECT period_id, occurred_at FROM finance_postings WHERE id = ?', id)
    expect(row!.period_id).not.toBe(october!.id)
    expect(row!.occurred_at).toBe(OCT_10)
  })

  it('records the totals at the close, refuses a second close and one before the period ends', async () => {
    const [close] = await rows<{ debits_minor: number, credits_minor: number }>("SELECT debits_minor, credits_minor FROM finance_period_closes WHERE action = 'close'")
    expect(close!.debits_minor).toBe(close!.credits_minor)
    const [october] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-10-01'")
    await expect(commit(unit => closePeriod(unit.view(), october!.id))).rejects.toMatchObject({ code: 'finance.period.already-closed' })
    const [november] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-11-01'")
    await expect(commit(unit => closePeriod(unit.view(), november!.id))).rejects.toMatchObject({ code: 'finance.period.blocked' })
    // Two closes in a row are refused by the trigger as well.
    await expect(env.DB.prepare("INSERT INTO finance_period_closes (id, period_id, action, at, debits_minor, credits_minor) VALUES (?, ?, 'close', 2, 0, 0)").bind(newId('pcl'), october!.id).run()).rejects.toThrow(/period closes/)
  })

  it('a period cannot close while an earlier one is open, even written straight to the database', async () => {
    const [november] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-11-01'")
    await commit(async (unit) => {
      unit.add({ sql: "INSERT INTO finance_periods (id, label, starts_on, ends_on, created_at, updated_at) VALUES (?, 'September 2026', '2026-09-01', '2026-09-30', 1, 1)", params: [newId('fpe')] })
    })
    await expect(env.DB.prepare("INSERT INTO finance_period_closes (id, period_id, action, at, debits_minor, credits_minor) VALUES (?, ?, 'close', 3, 0, 0)").bind(newId('pcl'), november!.id).run()).rejects.toThrow(/period closes/)
    const [september] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-09-01'")
    await commit(unit => closePeriod(unit.view(), september!.id))
  })

  it('reopens only with a reason from the list, and the close stays in the history', async () => {
    const [october] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-10-01'")
    await expect(commit(unit => reopenPeriod(unit.view(), october!.id, newId('trm')))).rejects.toThrow()
    // The vocabulary is made the first time a list is read.
    const { listTerms } = await import('#modules/core')
    const [reason] = await inContext(() => listTerms('finance.reopen-reason'))
    expect(reason).toBeDefined()
    await commit(unit => reopenPeriod(unit.view(), october!.id, reason!.id))
    expect(await inContext(() => isPeriodOpen('2026-10-10'))).toBe(true)
    expect(await count('SELECT count(*) AS n FROM finance_period_closes WHERE period_id = ?', october!.id)).toBe(2)
    await expect(env.DB.prepare('DELETE FROM finance_period_closes').run()).rejects.toThrow(/append-only/)
  })
})

describe('a correction', () => {
  it('reversal-is-exact-and-once: the mirror image, linked to the original; a second is refused', async () => {
    const [original] = await rows<{ id: string }>("SELECT id FROM finance_postings WHERE idempotency_key = 'order-1'")
    const id = await commit(unit => reversePosting(unit.view(), original!.id))
    const mirror = await rows<{ amount_minor: number, account_id: string }>('SELECT amount_minor, account_id FROM finance_entries WHERE posting_id = ? ORDER BY account_id', id)
    const source = await rows<{ amount_minor: number, account_id: string }>('SELECT amount_minor, account_id FROM finance_entries WHERE posting_id = ? ORDER BY account_id', original!.id)
    expect(mirror.map(m => [m.account_id, m.amount_minor])).toEqual(source.map(s => [s.account_id, -s.amount_minor]))
    const [row] = await rows<{ reverses_id: string, kind: string }>('SELECT reverses_id, kind FROM finance_postings WHERE id = ?', id)
    expect(row).toMatchObject({ reverses_id: original!.id, kind: 'correction' })
    await expect(commit(unit => reversePosting(unit.view(), original!.id))).rejects.toMatchObject({ code: 'finance.posting.already-reversed' })
  })
})

describe('the routes', () => {
  const handle = server({
    'GET /api/finance/periods/:id': periodRoute,
    'POST /api/finance/periods/:id/close': closeRoute,
    'POST /api/finance/postings/:id/reverse': reverseRoute,
  })

  it('show the close checklist and refuse a close to someone without the ability', async () => {
    const [november] = await rows<{ id: string }>("SELECT id FROM finance_periods WHERE starts_on = '2026-11-01'")
    const viewer = person(['finance.ledger.view'])
    const shown = await call(handle, 'GET', `/api/finance/periods/${november!.id}`, { actor: viewer })
    expect(shown.status).toBe(200)
    const body = await shown.json() as { blockers: { sentence: string }[] }
    expect(body.blockers.map(b => b.sentence).join(' ')).toMatch(/has not ended yet/)
    const refused = await call(handle, 'POST', `/api/finance/periods/${november!.id}/close`, { actor: viewer })
    expect(refused.status).toBe(403)
  })

  it('reverses a posting once through the route, replaying a repeated request', async () => {
    const [posting] = await rows<{ id: string }>("SELECT id FROM finance_postings WHERE idempotency_key = 'order-late'")
    const treasurer = person(['finance.posting.correct'])
    const first = await call(handle, 'POST', `/api/finance/postings/${posting!.id}/reverse`, { actor: treasurer, headers: { 'idempotency-key': 'rev-1' } })
    expect(first.status).toBe(200)
    const again = await call(handle, 'POST', `/api/finance/postings/${posting!.id}/reverse`, { actor: treasurer, headers: { 'idempotency-key': 'rev-1' } })
    expect(again.headers.get('idempotent-replay')).toBe('true')
    expect(await count('SELECT count(*) AS n FROM finance_postings WHERE reverses_id = ?', posting!.id)).toBe(1)
  })
})
