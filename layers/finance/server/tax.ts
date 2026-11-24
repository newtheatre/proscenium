// What other modules read of the ledger beyond balances (F-A2): sealed entry rows for an export, and
// totals by tax code for a VAT report. Neither lets a module read finance_entries itself. A route
// that serves either to a person requires finance.ledger.view, since both cover the whole ledger.
import { all, useSetting } from '#kit'
import type { EntryInput, PostingKind, PostingPurpose } from './ledger'

export interface LedgerRange {
  /** Facts that happened from this instant, inclusive. */
  startsAt: number
  /** To this instant, exclusive. */
  endsAt: number
}

export interface EntryRow {
  entryId: string
  postingId: string
  kind: PostingKind
  purpose: PostingPurpose | null
  source: { module: string, type: string, id: string }
  reversesId: string | null
  occurredAt: number
  accountId: string
  accountCode: string
  accountName: string
  accountKind: 'asset' | 'liability' | 'income' | 'expense' | 'equity'
  systemKey: string | null
  /** Positive is a debit, negative a credit. */
  amountMinor: number
  currency: string
  productionId: string | null
  performanceId: string | null
  budgetLineId: string | null
  forModule: string | null
  taxCode: string
  taxMinor: number
}

/** The most rows one page holds. */
export const ENTRY_PAGE_MAX = 1000 // not-policy: a page one Worker reads comfortably
const BASIS = 10_000 // not-policy: basis points in a whole

const SEALED = 'EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = p.id)'

/**
 * Sealed entries in the range, oldest first (by when the fact happened, then posting, then entry),
 * a page at a time: pass the last row's entryId as `afterId` for the next page.
 */
export async function entryRows(range: LedgerRange, options: { afterId?: string, limit: number }): Promise<EntryRow[]> {
  const limit = Math.max(1, Math.min(options.limit, ENTRY_PAGE_MAX))
  const after = options.afterId
    ? 'AND (p.occurred_at, p.id, e.id) > (SELECT q.occurred_at, q.id, x.id FROM finance_entries x JOIN finance_postings q ON q.id = x.posting_id WHERE x.id = ?)'
    : ''
  const rows = await all<{ entry_id: string, posting_id: string, kind: PostingKind, purpose: PostingPurpose | null, source_module: string, source_type: string, source_id: string, reverses_id: string | null, occurred_at: number, account_id: string, code: string, name: string, account_kind: EntryRow['accountKind'], system_key: string | null, amount_minor: number, currency: string, production_id: string | null, performance_id: string | null, budget_line_id: string | null, for_module: string | null, tax_code: string, tax_minor: number }>(
    `SELECT e.id AS entry_id, p.id AS posting_id, p.kind, p.purpose, p.source_module, p.source_type, p.source_id, p.reverses_id, p.occurred_at,
      a.id AS account_id, a.code, a.name, a.kind AS account_kind, a.system_key, e.amount_minor, e.currency, e.production_id, e.performance_id,
      e.budget_line_id, e.for_module, e.tax_code, e.tax_minor
    FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id
    WHERE p.occurred_at >= ? AND p.occurred_at < ? AND ${SEALED} ${after}
    ORDER BY p.occurred_at, p.id, e.id LIMIT ?`,
    ...[range.startsAt, range.endsAt, ...(options.afterId ? [options.afterId] : []), limit])
  return rows.map(r => ({
    entryId: r.entry_id,
    postingId: r.posting_id,
    kind: r.kind,
    purpose: r.purpose,
    source: { module: r.source_module, type: r.source_type, id: r.source_id },
    reversesId: r.reverses_id,
    occurredAt: r.occurred_at,
    accountId: r.account_id,
    accountCode: r.code,
    accountName: r.name,
    accountKind: r.account_kind,
    systemKey: r.system_key,
    amountMinor: r.amount_minor,
    currency: r.currency,
    productionId: r.production_id,
    performanceId: r.performance_id,
    budgetLineId: r.budget_line_id,
    forModule: r.for_module,
    taxCode: r.tax_code,
    taxMinor: r.tax_minor,
  }))
}

export interface EntryCount {
  accountId: string
  kind: PostingKind
  entries: number
}

/** How many sealed entries the range holds, by account and posting kind: an export's coverage without reading every row. */
export async function entryCounts(range: LedgerRange): Promise<EntryCount[]> {
  const rows = await all<{ account_id: string, kind: PostingKind, n: number }>(
    `SELECT e.account_id, p.kind, count(*) AS n FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id
    WHERE p.occurred_at >= ? AND p.occurred_at < ? AND ${SEALED} GROUP BY e.account_id, p.kind ORDER BY e.account_id, p.kind`,
    range.startsAt, range.endsAt)
  return rows.map(r => ({ accountId: r.account_id, kind: r.kind, entries: r.n }))
}

export interface TaxTotal {
  taxCode: string
  /** The kind of account the entries are on: income for sales, expense or asset for purchases. */
  accountKind: EntryRow['accountKind']
  /** `output` or `input` for the entries on Finance's own VAT accounts, otherwise null. */
  vatAccount: 'output' | 'input' | null
  currency: string
  /** The entries' amounts summed, debits positive. */
  amountMinor: number
  /** Their tax_minor summed, signed like the entries. */
  taxMinor: number
  entries: number
}

/**
 * Net and tax sums of sealed entries in the range, by tax code, account kind and VAT account, counted
 * by when each fact happened. A module that apportions its own VAT by payment under cash accounting
 * (Invoices) leaves its postings out with `exceptModules` and adds its own figures.
 */
export async function taxTotals(range: LedgerRange, options: { exceptModules?: string[] } = {}): Promise<TaxTotal[]> {
  const except = options.exceptModules?.length ? 'AND p.source_module NOT IN (SELECT value FROM json_each(?))' : ''
  const rows = await all<{ tax_code: string, account_kind: TaxTotal['accountKind'], vat: TaxTotal['vatAccount'], currency: string, amount: number, tax: number, n: number }>(
    `SELECT e.tax_code, a.kind AS account_kind,
      CASE a.system_key WHEN 'finance.vat-output' THEN 'output' WHEN 'finance.vat-input' THEN 'input' END AS vat,
      e.currency, sum(e.amount_minor) AS amount, sum(e.tax_minor) AS tax, count(*) AS n
    FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id
    WHERE p.occurred_at >= ? AND p.occurred_at < ? AND ${SEALED} ${except}
      AND (e.tax_code <> 'none' OR a.system_key IN ('finance.vat-output', 'finance.vat-input'))
    GROUP BY e.tax_code, a.kind, vat, e.currency ORDER BY e.tax_code, a.kind, vat`,
    ...[range.startsAt, range.endsAt, ...(except ? [JSON.stringify(options.exceptModules)] : [])])
  return rows.map(r => ({ taxCode: r.tax_code, accountKind: r.account_kind, vatAccount: r.vat ?? null, currency: r.currency, amountMinor: r.amount, taxMinor: r.tax, entries: r.n }))
}

export interface TaxCode {
  code: string
  label: string
  rateBasisPoints: number
  active: boolean
  inScope: boolean
  /** Whether any entry uses it, which fixes its rate. */
  used: boolean
}

/** Every tax code, `none` first, then by rate, highest first. */
export async function listTaxCodes(options: { activeOnly?: boolean } = {}): Promise<TaxCode[]> {
  const rows = await all<{ code: string, label: string, rate_basis_points: number, active: number, in_scope: number, used: number }>(
    `SELECT t.code, t.label, t.rate_basis_points, t.active, t.in_scope, (t.code = 'none' OR EXISTS (SELECT 1 FROM finance_entries e WHERE e.tax_code = t.code)) AS used
    FROM finance_tax_codes t ${options.activeOnly ? 'WHERE t.active = 1' : ''}
    ORDER BY t.code <> 'none', t.rate_basis_points DESC, t.code`)
  return rows.map(r => ({ code: r.code, label: r.label, rateBasisPoints: r.rate_basis_points, active: r.active === 1, inScope: r.in_scope === 1, used: r.used === 1 }))
}

/** An entry whose amount includes VAT at `taxCode`, as a till price does (FIN-07). */
export type InclusiveEntry = Omit<EntryInput, 'taxMinor'>

/**
 * Splits VAT-inclusive amounts at posting (BO-78, BAR-60): each entry becomes its net amount with
 * the VAT as its tax_minor, and the VAT goes on finance.vat-output (sales) or finance.vat-input
 * (purchases), one entry per code. A theatre not registered for VAT records no codes at all.
 */
export async function splitVat(entries: InclusiveEntry[], side: 'output' | 'input'): Promise<EntryInput[]> {
  const coded = entries.filter(e => (e.taxCode ?? 'none') !== 'none')
  if (!coded.length) return entries
  if (await useSetting('finance.tax.registered') !== true) return entries.map(e => ({ ...e, taxCode: 'none' }))
  const rates = new Map((await all<{ code: string, rate_basis_points: number }>('SELECT code, rate_basis_points FROM finance_tax_codes WHERE code IN (SELECT value FROM json_each(?))', JSON.stringify([...new Set(coded.map(e => e.taxCode))])))
    .map(r => [r.code, r.rate_basis_points]))
  const vat = new Map<string, number>()
  const out: EntryInput[] = entries.map((e) => {
    const code = e.taxCode ?? 'none'
    const rate = rates.get(code) ?? 0
    if (code === 'none' || !rate) return { ...e, taxMinor: 0 }
    const tax = vatIn(e.amountMinor, rate)
    if (tax) vat.set(code, (vat.get(code) ?? 0) + tax)
    return { ...e, amountMinor: e.amountMinor - tax, taxMinor: tax }
  })
  for (const [code, amountMinor] of vat) {
    if (amountMinor) out.push({ account: { key: `finance.vat-${side}` }, amountMinor, forModule: 'finance', taxCode: code, taxMinor: 0 })
  }
  return out
}

/** The tax code a price sells at when its product or ticket type names none (FIN-07). */
export async function defaultTaxCode(): Promise<string> {
  return await useSetting('finance.tax.default-code') as string
}

/** The rate of each code, or none at all while the theatre is not registered, when nothing carries VAT. */
export async function vatRates(): Promise<Map<string, number>> {
  if (await useSetting('finance.tax.registered') !== true) return new Map()
  return new Map((await all<{ code: string, rate_basis_points: number }>('SELECT code, rate_basis_points FROM finance_tax_codes')).map(r => [r.code, r.rate_basis_points]))
}

/** The VAT inside a VAT-inclusive amount at a rate, signed like it, as splitVat takes it out. */
export function vatIn(amountMinor: number, rateBasisPoints: number): number {
  return rateBasisPoints ? Math.sign(amountMinor) * Math.round(Math.abs(amountMinor) * rateBasisPoints / (BASIS + rateBasisPoints)) : 0
}
