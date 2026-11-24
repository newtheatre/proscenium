// Writing to the ledger: a posting, its entries and its seal, added to the caller's unit of work so
// they commit with the change that caused them, or not at all. The database has the last word: the
// seal's trigger refuses a posting that does not balance, and others refuse a posting into a closed
// period, an entry to another module's account and any entry added after the seal.
import { all, first, localDate, newId, nowMs, Refusal, useContext, useSetting, usePoint, type UnitView } from '#kit'
import { entries as entriesTable } from './db/schema'
import { addPeriods, missingPeriods, PERIOD_FOR_DATE } from './periods'

export type PostingKind = 'sale' | 'refund' | 'fee' | 'payout' | 'recognition' | 'transfer' | 'cash_variance' | 'unfulfilled' | 'correction' | 'opening'

/**
 * Why a transfer was posted, where the kind alone does not say: an approved claim (Budgets), money
 * paid out for any owner (Payments), and the four facts of Invoices. Every one is posted as kind
 * `transfer`, never `payout`, since Finance's reconcile screen reads any asset account a payout empties
 * as a clearing account (Budgets and claims, part 4).
 */
export const PURPOSES = ['expense', 'disbursement', 'bill', 'invoice', 'credit_note', 'write_off'] as const
export type PostingPurpose = typeof PURPOSES[number]

/** The modules that may write entries for another module's part: Payments (a payment) and Invoices (an invoice line) (F-A1). */
export const COLLECTORS: readonly string[] = ['payments', 'invoicing']

/** An account by id, or by the system key a module declared (and, for a scoped account, its scope). */
export type AccountRef = string | { key: string, scope?: string }

export interface EntryInput {
  account: AccountRef
  /** Positive is a debit, negative a credit. Never zero. */
  amountMinor: number
  /** Set by Payments or Invoices to the owner of the part these entries were returned for. */
  forModule?: string
  productionId?: string | null
  performanceId?: string | null
  /** The budget line this entry is spent against (Budgets). */
  budgetLineId?: string | null
  /** A code from finance_tax_codes; `none` when left out. */
  taxCode?: string
  /** The VAT on this entry's net amount, signed like the entry, posted on its own entry to a VAT account. 0 for `none`. */
  taxMinor?: number
}

export interface PostingInput {
  /** The same business fact is posted once: build it from the source, such as box-office:order:<id>:paid. */
  key: string
  source: { module: string, type: string, id: string }
  kind: PostingKind
  /** Why a transfer was posted. Only a transfer, or the reversal of one, carries a purpose. */
  purpose?: PostingPurpose | null
  /** When the fact happened. Defaults to now. */
  occurredAt?: number
  /** Defaults to the core's currency. Every entry of a posting has the same one. */
  currency?: string
  /** The account that posted it; defaults to the person acting, and is null for the system. */
  postedBy?: string | null
  reversesId?: string
  entries: EntryInput[]
}

interface AccountRow { id: string, module: string, system_key: string | null, scope: string | null, active: number }

const isKey = (ref: AccountRef): ref is { key: string, scope?: string } => typeof ref !== 'string'

/** The account id behind a system key, such as the clearing account of one provider account. */
export async function accountFor(systemKey: string, scope?: string | null): Promise<string | null> {
  const row = await first<{ id: string }>("SELECT id FROM finance_accounts WHERE system_key = ? AND coalesce(scope, '') = ?", systemKey, scope ?? '')
  return row?.id ?? null
}

/** The declarations of `finance.system-account` by full key, from modules that are on. */
export async function declaredAccounts(): Promise<Map<string, { module: string, key: string, name: string, kind: string, scoped: boolean }>> {
  const out = new Map<string, { module: string, key: string, name: string, kind: string, scoped: boolean }>()
  for (const c of await usePoint<{ id: string, name: string, kind: string, scoped?: boolean }>('finance.system-account')) {
    out.set(`${c.module}.${c.value.id}`, { module: c.module, key: `${c.module}.${c.value.id}`, name: c.value.name, kind: c.value.kind, scoped: !!c.value.scoped })
  }
  return out
}

/** One statement adding accounts that are not there yet; one another unit added meanwhile is ignored. */
// Accounts made by postings earlier in a unit that has not committed yet, so a second posting in the
// same unit (a sale and its fee, say) uses the account the first one makes rather than making another.
// Forgotten when the unit commits; the few left by units that fail are dropped oldest first.
const unitAccounts = new Map<string, Map<string, { id: string, module: string }>>()
const UNITS_REMEMBERED = 64 // not-policy: a bound on memory, far above the units open at once

function madeIn(unit: UnitView): Map<string, { id: string, module: string }> {
  let made = unitAccounts.get(unit.id)
  if (!made) {
    made = new Map()
    unitAccounts.set(unit.id, made)
    unit.afterCommit(() => unitAccounts.delete(unit.id))
    if (unitAccounts.size > UNITS_REMEMBERED) unitAccounts.delete(unitAccounts.keys().next().value!)
  }
  return made
}

function addAccounts(unit: UnitView, rows: { id: string, code: string, name: string, kind: string, module: string, systemKey: string, scope: string | null }[]) {
  if (!rows.length) return
  const at = nowMs()
  unit.add({
    sql: `INSERT OR IGNORE INTO finance_accounts (id, code, name, kind, module, system_key, scope, active, created_at, updated_at)
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), 1, ?, ? FROM json_each(?)`,
    params: [at, at, JSON.stringify(rows.map(r => [r.id, r.code, r.name, r.kind, r.module, r.systemKey, r.scope]))],
  })
}

/** Makes the unscoped accounts a module declares, locked to it. Called when a module is switched on. */
export async function ensureSystemAccounts(unit: UnitView, module: string): Promise<void> {
  const declared = [...(await declaredAccounts()).values()].filter(d => d.module === module && !d.scoped)
  const missing: Parameters<typeof addAccounts>[1] = []
  for (const d of declared) {
    if (await accountFor(d.key)) continue
    missing.push({ id: newId('lac'), code: d.key, name: d.name, kind: d.kind, module: d.module, systemKey: d.key, scope: null })
  }
  addAccounts(unit, missing)
}

/**
 * Makes the account a module declared as scoped for one of its records, such as the clearing account
 * of a provider account. Its code starts as `<key>.<scope>` until the treasurer recodes it.
 */
export async function ensureScopedAccount(unit: UnitView, systemKey: string, scope: string, name?: string): Promise<void> {
  const declared = (await declaredAccounts()).get(systemKey)
  if (!declared?.scoped) throw new Error(`${systemKey} is not a scoped account declared through finance.system-account`)
  if (await accountFor(systemKey, scope)) return
  addAccounts(unit, [{ id: newId('lac'), code: `${systemKey}.${scope}`, name: name ?? declared.name, kind: declared.kind, module: declared.module, systemKey, scope }])
}

function checkShape(posting: PostingInput) {
  const amounts = posting.entries.map(e => e.amountMinor)
  if (amounts.length < 2) throw new Error(`Posting ${posting.key} has fewer than two entries`)
  if (amounts.some(a => !Number.isSafeInteger(a) || a === 0)) throw new Error(`Posting ${posting.key} has an entry that is not a whole, non-zero number of minor units`)
  if (amounts.reduce((s, a) => s + a, 0) !== 0) throw new Error(`Posting ${posting.key} does not balance`)
  for (const e of posting.entries) {
    if (e.taxMinor !== undefined && !Number.isSafeInteger(e.taxMinor)) throw new Error(`Posting ${posting.key} has tax that is not a whole number of minor units`)
    if ((e.taxCode ?? 'none') === 'none' && (e.taxMinor ?? 0) !== 0) throw new Error(`Posting ${posting.key} has tax on an entry with the code none`)
    if ((e.taxMinor ?? 0) !== 0 && Math.sign(e.taxMinor!) !== Math.sign(e.amountMinor)) throw new Error(`Posting ${posting.key} has tax signed unlike its entry`)
  }
  if (posting.purpose == null) return
  if (!(PURPOSES as readonly string[]).includes(posting.purpose)) throw new Error(`Posting ${posting.key} has the purpose ${posting.purpose}, which is not one of ${PURPOSES.join(', ')}`)
  if (posting.kind !== 'transfer' && !(posting.kind === 'correction' && posting.reversesId)) throw new Error(`Posting ${posting.key} has a purpose, which only a transfer (or its reversal) carries`)
}

/**
 * Adds a posting, its entries and its seal to the unit, and returns the posting's id. The period is
 * the one the fact's local date falls in, or the earliest open one after it when that is closed.
 * The batch fails if the entries do not balance, an account belongs to another module, or the
 * idempotency key has been posted before.
 */
export async function postEntries(unit: UnitView, posting: PostingInput): Promise<string> {
  checkShape(posting)
  const context = useContext()
  const currency = posting.currency ?? await useSetting('core.locale.currency') as string
  const occurredAt = posting.occurredAt ?? nowMs()
  const date = await localDate(occurredAt)

  // Resolve every account, making a missing declared one (of a module that is on) in this unit.
  const declared = await declaredAccounts()
  const ids = posting.entries.filter(e => typeof e.account === 'string').map(e => e.account as string)
  const known = new Map<string, AccountRow>()
  if (ids.length) for (const row of await all<AccountRow>('SELECT id, module, system_key, scope, active FROM finance_accounts WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))) known.set(row.id, row)
  const toMake: Parameters<typeof addAccounts>[1] = []
  const resolved: { id: string, module: string }[] = []
  for (const entry of posting.entries) {
    if (!isKey(entry.account)) {
      const row = known.get(entry.account)
      if (!row) throw new Refusal('finance.account.missing', `There is no ledger account ${entry.account}.`, { status: 409 })
      resolved.push({ id: row.id, module: row.module })
      continue
    }
    const { key, scope } = entry.account
    const found = await first<AccountRow>("SELECT id, module, system_key, scope, active FROM finance_accounts WHERE system_key = ? AND coalesce(scope, '') = ?", key, scope ?? '')
    if (found) {
      resolved.push({ id: found.id, module: found.module })
      continue
    }
    const decl = declared.get(key)
    const pending = toMake.find(r => r.systemKey === key && r.scope === (scope ?? null)) ?? madeIn(unit).get(`${key}\u0000${scope ?? ''}`)
    if (pending) {
      resolved.push({ id: pending.id, module: pending.module })
      continue
    }
    if (!decl || decl.scoped !== !!scope) throw new Refusal('finance.account.missing', `There is no ledger account ${key}${scope ? ` for ${scope}` : ''}.`, { status: 409, remedy: 'Switch on the module that declares it, or add it on the Accounts screen.' })
    const made = { id: newId('lac'), code: scope ? `${key}.${scope}` : key, name: decl.name, kind: decl.kind, module: decl.module, systemKey: key, scope: scope ?? null }
    toMake.push(made)
    resolved.push({ id: made.id, module: made.module })
  }

  // The same rule the trigger enforces, said clearly before the batch is built.
  posting.entries.forEach((entry, i) => {
    const owner = entry.forModule ?? posting.source.module
    const manual = posting.source.module === 'finance' && (posting.kind === 'correction' || posting.kind === 'opening')
    if (entry.forModule && entry.forModule !== posting.source.module && !COLLECTORS.includes(posting.source.module))
      throw new Refusal('finance.entry.wrong-module', `Only Payments and Invoices post entries on behalf of another module (posting ${posting.key}).`, { status: 500 })
    if (!manual && resolved[i]!.module !== owner)
      throw new Refusal('finance.entry.wrong-module', `${owner} cannot post to an account that belongs to ${resolved[i]!.module}.`, { status: 500 })
  })

  // Every code named is known. A stopped code is no longer offered, but stays on the prices that use it.
  const codes = [...new Set(posting.entries.map(e => e.taxCode ?? 'none').filter(c => c !== 'none'))]
  if (codes.length) {
    const found = await all<{ code: string }>('SELECT code FROM finance_tax_codes WHERE code IN (SELECT value FROM json_each(?))', JSON.stringify(codes))
    for (const code of codes) {
      if (!found.some(r => r.code === code)) throw new Refusal('finance.tax-code.missing', `There is no tax code ${code}.`, { status: 409 })
    }
  }

  addAccounts(unit, toMake)
  for (const made of toMake) madeIn(unit).set(`${made.systemKey}\u0000${made.scope ?? ''}`, made)
  addPeriods(unit, await missingPeriods(date))

  const postingId = newId('post')
  const postedBy = posting.postedBy !== undefined ? posting.postedBy : (context.actor.kind === 'person' ? context.actor.accountId ?? null : null)
  unit.add({
    sql: `INSERT INTO finance_postings (id, idempotency_key, source_module, source_type, source_id, kind, purpose, reverses_id, period_id, occurred_at, posted_at, posted_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${PERIOD_FOR_DATE}, ?, ?, ?)`,
    params: [postingId, posting.key, posting.source.module, posting.source.type, posting.source.id, posting.kind, posting.purpose ?? null, posting.reversesId ?? null, date, occurredAt, nowMs(), postedBy],
  })
  unit.insertSet(entriesTable, posting.entries.map((entry, i) => ({
    postingId,
    accountId: resolved[i]!.id,
    amountMinor: entry.amountMinor,
    currency,
    forModule: entry.forModule ?? null,
    productionId: entry.productionId ?? null,
    performanceId: entry.performanceId ?? null,
    budgetLineId: entry.budgetLineId ?? null,
    taxCode: entry.taxCode ?? 'none',
    taxMinor: entry.taxMinor ?? 0,
  })))
  unit.expect(posting.entries.length)
  unit.add({ sql: 'INSERT INTO finance_seals (posting_id, entry_count, created_at) VALUES (?, ?, ?)', params: [postingId, posting.entries.length, nowMs()] })
  return postingId
}

/**
 * Adds the mirror image of a sealed posting, linked to it by `reverses_id`. A posting is reversed
 * once: a second reversal fails its batch on the unique index.
 */
export async function reversePosting(unit: UnitView, postingId: string, options: { occurredAt?: number, postedBy?: string | null } = {}): Promise<string> {
  const original = await first<{ id: string, idempotency_key: string, source_module: string, source_type: string, source_id: string, purpose: PostingPurpose | null, reverses_id: string | null }>(
    'SELECT p.* FROM finance_postings p JOIN finance_seals s ON s.posting_id = p.id WHERE p.id = ?', postingId)
  if (!original) throw new Refusal('core.not-found', 'There is no such posting.', { status: 404 })
  const reversed = await first('SELECT id FROM finance_postings WHERE reverses_id = ?', postingId)
  if (reversed) throw new Refusal('finance.posting.already-reversed', 'This posting has already been reversed.', { status: 409 })
  const lines = await all<{ account_id: string, amount_minor: number, currency: string, for_module: string | null, production_id: string | null, performance_id: string | null, budget_line_id: string | null, tax_code: string, tax_minor: number }>(
    'SELECT account_id, amount_minor, currency, for_module, production_id, performance_id, budget_line_id, tax_code, tax_minor FROM finance_entries WHERE posting_id = ? ORDER BY id', postingId)
  return postEntries(unit, {
    key: `${original.idempotency_key}:reversed`,
    source: { module: original.source_module, type: original.source_type, id: original.source_id },
    kind: 'correction',
    purpose: original.purpose,
    reversesId: original.id,
    occurredAt: options.occurredAt,
    postedBy: options.postedBy,
    currency: lines[0]?.currency,
    entries: lines.map(l => ({ account: l.account_id, amountMinor: -l.amount_minor, forModule: l.for_module ?? undefined, productionId: l.production_id, performanceId: l.performance_id, budgetLineId: l.budget_line_id, taxCode: l.tax_code, taxMinor: -l.tax_minor })),
  })
}

export interface BalanceFilter {
  periodId?: string
  /** Facts that happened from this instant, inclusive, to `to`, exclusive. */
  from?: number
  to?: number
  accountIds?: string[]
  systemKeys?: string[]
  productionId?: string
  performanceId?: string
  sourceModule?: string
  /** Entries spent against any of these budget lines. Any number: they are read as a subquery. */
  budgetLineIds?: string[]
  /** Postings with any of these purposes. */
  purposes?: PostingPurpose[]
}

export interface Balance {
  accountId: string
  code: string
  name: string
  kind: string
  module: string
  systemKey: string | null
  scope: string | null
  currency: string
  debitsMinor: number
  creditsMinor: number
  /** Debits less credits. */
  balanceMinor: number
}

/** Totals by account from sealed postings: the only way another module reads the ledger. */
export async function balances(filter: BalanceFilter = {}): Promise<Balance[]> {
  const where: string[] = []
  const params: unknown[] = []
  const add = (clause: string, value: unknown) => {
    where.push(clause)
    params.push(value)
  }
  if (filter.periodId) add('p.period_id = ?', filter.periodId)
  if (filter.from !== undefined) add('p.occurred_at >= ?', filter.from)
  if (filter.to !== undefined) add('p.occurred_at < ?', filter.to)
  if (filter.accountIds) add('a.id IN (SELECT value FROM json_each(?))', JSON.stringify(filter.accountIds))
  if (filter.systemKeys) add('a.system_key IN (SELECT value FROM json_each(?))', JSON.stringify(filter.systemKeys))
  if (filter.productionId) add('e.production_id = ?', filter.productionId)
  if (filter.performanceId) add('e.performance_id = ?', filter.performanceId)
  if (filter.sourceModule) add('p.source_module = ?', filter.sourceModule)
  if (filter.budgetLineIds) add('e.budget_line_id IN (SELECT value FROM json_each(?))', JSON.stringify(filter.budgetLineIds))
  if (filter.purposes) add('p.purpose IN (SELECT value FROM json_each(?))', JSON.stringify(filter.purposes))
  const rows = await all<{ account_id: string, code: string, name: string, kind: string, module: string, system_key: string | null, scope: string | null, currency: string, debits: number, credits: number }>(
    `SELECT a.id AS account_id, a.code, a.name, a.kind, a.module, a.system_key, a.scope, e.currency,
      coalesce(sum(CASE WHEN e.amount_minor > 0 THEN e.amount_minor END), 0) AS debits,
      coalesce(sum(CASE WHEN e.amount_minor < 0 THEN -e.amount_minor END), 0) AS credits
    FROM finance_entries e
    JOIN finance_postings p ON p.id = e.posting_id
    JOIN finance_seals s ON s.posting_id = p.id
    JOIN finance_accounts a ON a.id = e.account_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY a.id, e.currency ORDER BY a.code`, ...params)
  return rows.map(r => ({ accountId: r.account_id, code: r.code, name: r.name, kind: r.kind, module: r.module, systemKey: r.system_key, scope: r.scope, currency: r.currency, debitsMinor: r.debits, creditsMinor: r.credits, balanceMinor: r.debits - r.credits }))
}

export interface AccountSummary {
  id: string
  code: string
  name: string
  kind: 'asset' | 'liability' | 'income' | 'expense' | 'equity'
  module: string
  systemKey: string | null
  scope: string | null
}

/**
 * A module's active accounts, optionally of one kind, by code: those it declared and those the
 * treasurer gave it. How another module offers them (a Budgets category's expense account) without
 * reading finance_accounts.
 */
export async function accountsOf(module: string, kind?: AccountSummary['kind']): Promise<AccountSummary[]> {
  const rows = await all<{ id: string, code: string, name: string, kind: AccountSummary['kind'], module: string, system_key: string | null, scope: string | null }>(
    `SELECT id, code, name, kind, module, system_key, scope FROM finance_accounts WHERE module = ? AND active = 1${kind ? ' AND kind = ?' : ''} ORDER BY code`,
    ...(kind ? [module, kind] : [module]))
  return rows.map(r => ({ id: r.id, code: r.code, name: r.name, kind: r.kind, module: r.module, systemKey: r.system_key, scope: r.scope }))
}

/** What sealed entries spent against each budget line come to, debits positive: a budget's Spent (Budgets, BC-10). */
export async function budgetLineTotals(lineIds: readonly string[]): Promise<Map<string, number>> {
  if (!lineIds.length) return new Map()
  const rows = await all<{ line: string, amount: number }>(
    `SELECT e.budget_line_id AS line, sum(e.amount_minor) AS amount FROM finance_entries e
      WHERE e.budget_line_id IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = e.posting_id)
      GROUP BY e.budget_line_id`, JSON.stringify(lineIds))
  return new Map(rows.map(r => [r.line, r.amount]))
}

/** Every account, active or not, with whether any entry uses it: what an export maps to other books' codes. */
export async function ledgerAccounts(): Promise<(AccountSummary & { active: boolean, used: boolean })[]> {
  const rows = await all<{ id: string, code: string, name: string, kind: AccountSummary['kind'], module: string, system_key: string | null, scope: string | null, active: number, used: number }>(
    'SELECT a.id, a.code, a.name, a.kind, a.module, a.system_key, a.scope, a.active, EXISTS (SELECT 1 FROM finance_entries e WHERE e.account_id = a.id) AS used FROM finance_accounts a ORDER BY a.module, a.code')
  return rows.map(r => ({ id: r.id, code: r.code, name: r.name, kind: r.kind, module: r.module, systemKey: r.system_key, scope: r.scope, active: r.active === 1, used: r.used === 1 }))
}
