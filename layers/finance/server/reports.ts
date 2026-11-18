// What Finance reports from the ledger (Box office specification, part 5; FIN-04, FIN-05, FIN-06):
// a production's statement, the postings of a date range as CSV, and the money held in clearing
// accounts against the payouts that empty them. Every figure is read from sealed postings only.
import { all, first, Refusal, theatreTimeZone } from '#kit'
import { instantOfLocal, previousDate } from '#kit/clock'

const SEALED = 'EXISTS (SELECT 1 FROM finance_seals s WHERE s.posting_id = p.id)'

export interface StatementLine {
  accountId: string
  code: string
  name: string
  kind: string
  currency: string
  /** Credits less debits by the kind of posting, so income reads positive. */
  salesMinor: number
  refundsMinor: number
  otherMinor: number
  netMinor: number
}

/**
 * One production's statement: every entry a module tagged with the production, by account, split
 * into sales, refunds and everything else. Income and deferred income read positive; a fee or other
 * cost tagged with the production reads negative. Money accounts are not tagged, so they never show.
 */
export async function productionStatement(productionId: string): Promise<{ lines: StatementLine[], performances: PerformanceLine[] }> {
  const rows = await all<{ account_id: string, code: string, name: string, kind: string, currency: string, posting_kind: string, amount: number }>(
    `SELECT a.id AS account_id, a.code, a.name, a.kind, e.currency, p.kind AS posting_kind, sum(e.amount_minor) AS amount
      FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id
      WHERE e.production_id = ? AND ${SEALED} GROUP BY a.id, e.currency, p.kind ORDER BY a.code`, productionId)
  const lines = new Map<string, StatementLine>()
  for (const r of rows) {
    const key = `${r.account_id}:${r.currency}`
    const line = lines.get(key) ?? { accountId: r.account_id, code: r.code, name: r.name, kind: r.kind, currency: r.currency, salesMinor: 0, refundsMinor: 0, otherMinor: 0, netMinor: 0 }
    const credit = -r.amount
    if (r.posting_kind === 'sale') line.salesMinor += credit
    else if (r.posting_kind === 'refund') line.refundsMinor += credit
    else line.otherMinor += credit
    line.netMinor += credit
    lines.set(key, line)
  }
  return { lines: [...lines.values()], performances: await performanceLines(productionId) }
}

export interface PerformanceLine { performanceId: string, currency: string, salesMinor: number, refundsMinor: number, otherMinor: number, netMinor: number }

/**
 * The same statement by performance: everything tagged with each of the production's performances,
 * across accounts. Moving deferred income to income when a performance has happened nets to nothing,
 * so a performance's net is what it took less what it gave back. Entries tagged with the production
 * alone are left out here and still count in the totals by account.
 */
async function performanceLines(productionId: string): Promise<PerformanceLine[]> {
  const rows = await all<{ performance_id: string, currency: string, posting_kind: string, amount: number }>(
    `SELECT e.performance_id, e.currency, p.kind AS posting_kind, sum(e.amount_minor) AS amount
      FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id
      WHERE e.production_id = ? AND e.performance_id IS NOT NULL AND ${SEALED} GROUP BY e.performance_id, e.currency, p.kind`, productionId)
  const lines = new Map<string, PerformanceLine>()
  for (const r of rows) {
    const key = `${r.performance_id}:${r.currency}`
    const line = lines.get(key) ?? { performanceId: r.performance_id, currency: r.currency, salesMinor: 0, refundsMinor: 0, otherMinor: 0, netMinor: 0 }
    const credit = -r.amount
    if (r.posting_kind === 'sale') line.salesMinor += credit
    else if (r.posting_kind === 'refund') line.refundsMinor += credit
    else line.otherMinor += credit
    line.netMinor += credit
    lines.set(key, line)
  }
  return [...lines.values()]
}

/** Every production with entries in the ledger, with its income and deferred income, largest first. */
export async function productionsInLedger(): Promise<{ productionId: string, currency: string, netMinor: number }[]> {
  const rows = await all<{ production_id: string, currency: string, amount: number }>(
    `SELECT e.production_id, e.currency, sum(CASE WHEN a.kind IN ('income', 'liability') THEN e.amount_minor ELSE 0 END) AS amount
      FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id
      WHERE e.production_id IS NOT NULL AND ${SEALED} GROUP BY e.production_id, e.currency ORDER BY amount`)
  return rows.map(r => ({ productionId: r.production_id, currency: r.currency, netMinor: -r.amount }))
}

/** The instants a range of local dates covers: from the start of `from` to the start of the day after `to`. */
export async function rangeOf(from: string, to: string): Promise<{ startsAt: number, endsAt: number }> {
  const zone = await theatreTimeZone()
  return { startsAt: instantOfLocal(from, '00:00', zone), endsAt: instantOfLocal(previousDate(to, -1), '00:00', zone) }
}

export const EXPORT_COLUMNS = [
  { key: 'posting', label: 'Posting' },
  { key: 'date', label: 'Date' },
  { key: 'kind', label: 'Kind' },
  { key: 'source', label: 'Source' },
  { key: 'reverses', label: 'Reverses' },
  { key: 'code', label: 'Account code' },
  { key: 'account', label: 'Account' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
  { key: 'currency', label: 'Currency' },
  { key: 'production', label: 'Production' },
  { key: 'performance', label: 'Performance' },
] as const

/** The most entry lines one export holds; a longer range is refused with the count. */
export const EXPORT_CEILING = 50_000 // not-policy: a size one Worker response builds comfortably

/** One row per entry of every sealed posting that happened in the range, oldest first. */
export async function exportRows(range: { startsAt: number, endsAt: number }): Promise<Record<string, string | number | null>[]> {
  const counted = await first<{ n: number }>(`SELECT count(*) AS n FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id WHERE p.occurred_at >= ? AND p.occurred_at < ? AND ${SEALED}`, range.startsAt, range.endsAt)
  if ((counted?.n ?? 0) > EXPORT_CEILING)
    throw new Refusal('finance.export.too-long', `That range holds ${counted!.n} lines, more than one export takes.`, { status: 422, remedy: 'Export a shorter range, such as one period at a time.' })
  const zone = await theatreTimeZone()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const rows = await all<{ posting_id: string, occurred_at: number, kind: string, source_module: string, source_type: string, source_id: string, reverses_id: string | null, code: string, name: string, amount_minor: number, currency: string, production_id: string | null, performance_id: string | null }>(
    `SELECT p.id AS posting_id, p.occurred_at, p.kind, p.source_module, p.source_type, p.source_id, p.reverses_id, a.code, a.name, e.amount_minor, e.currency, e.production_id, e.performance_id
      FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id
      WHERE p.occurred_at >= ? AND p.occurred_at < ? AND ${SEALED} ORDER BY p.occurred_at, p.id, e.id`, range.startsAt, range.endsAt)
  const major = (minor: number, currency: string) => {
    const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    return (minor / 10 ** digits).toFixed(digits) // not-policy: minor units to major
  }
  return rows.map(r => ({
    posting: r.posting_id,
    date: day.format(r.occurred_at),
    kind: r.kind,
    source: `${r.source_type}:${r.source_id}`,
    reverses: r.reverses_id,
    code: r.code,
    account: r.name,
    debit: r.amount_minor > 0 ? major(r.amount_minor, r.currency) : '',
    credit: r.amount_minor < 0 ? major(-r.amount_minor, r.currency) : '',
    currency: r.currency,
    production: r.production_id,
    performance: r.performance_id,
  }))
}

/** CSV with the quoting spreadsheets expect, and a guard against formulas in a cell. */
export function toCsv(rows: readonly Record<string, unknown>[], columns: readonly { key: string, label: string }[]): string {
  const cell = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map(c => cell(c.label)).join(',')]
  for (const row of rows) lines.push(columns.map(c => cell(row[c.key])).join(','))
  return `${lines.join('\r\n')}\r\n`
}

export interface ClearingLine { accountId: string, code: string, name: string, scope: string | null, currency: string, balanceMinor: number, paidOutMinor: number, lastPayoutAt: number | null }

/**
 * Reconciliation by totals (FIN-06, first release): every asset account a payout has ever emptied, or
 * that is kept per record (a clearing account per provider account), with what it holds now. Money
 * held in one should equal the payouts still to come from that provider.
 */
export async function clearingAccounts(): Promise<ClearingLine[]> {
  const rows = await all<{ account_id: string, code: string, name: string, scope: string | null, currency: string, balance: number, paid_out: number, last_payout: number | null }>(
    `SELECT a.id AS account_id, a.code, a.name, a.scope, e.currency, sum(e.amount_minor) AS balance,
      coalesce(-sum(CASE WHEN p.kind = 'payout' AND e.amount_minor < 0 THEN e.amount_minor END), 0) AS paid_out,
      max(CASE WHEN p.kind = 'payout' THEN p.occurred_at END) AS last_payout
      FROM finance_accounts a JOIN finance_entries e ON e.account_id = a.id JOIN finance_postings p ON p.id = e.posting_id
      WHERE a.kind = 'asset' AND ${SEALED}
        AND (a.scope IS NOT NULL OR EXISTS (SELECT 1 FROM finance_entries x JOIN finance_postings q ON q.id = x.posting_id WHERE x.account_id = a.id AND q.kind = 'payout' AND x.amount_minor < 0))
      GROUP BY a.id, e.currency ORDER BY a.code`)
  return rows.map(r => ({ accountId: r.account_id, code: r.code, name: r.name, scope: r.scope, currency: r.currency, balanceMinor: r.balance, paidOutMinor: r.paid_out, lastPayoutAt: r.last_payout }))
}
