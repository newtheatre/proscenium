// Budgets' figures for Reports (BC-35, core.measure): budgeted, committed and spent on the expense
// lines of approved budgets whose finance year meets the period, and claims awaiting a decision.
import { all, type MeasureQuery, type MeasureRow } from '#kit'
import { previousDate } from '#kit/clock'
import { budgetLineTotals, rangeOf } from '#modules/finance'
import { budgetLines, type Budget } from './budgets'

type Answer = Promise<{ rows: MeasureRow[] } | 'unsupported'>
type Keys = MeasureRow['keys']
export const BY = ['production', 'season', 'budgets.line', 'budgets.department'] as const

const COLUMNS = `b.id, b.name, b.scope, b.production_id AS productionId, b.season_id AS seasonId, b.department_term_id AS departmentTermId,
  b.year_starts_on AS yearStartsOn, b.parent_line_id AS parentLineId, b.currency, b.state`

/** Approved or closed budgets whose year meets the period, narrowed by a production or season scope. */
async function budgetsFor(query: MeasureQuery): Promise<Budget[] | 'unsupported'> {
  const scope = query.scope ?? {}
  if (Object.keys(scope).some(k => k !== 'production' && k !== 'season')) return 'unsupported'
  const narrow = 'production' in scope ? 'AND b.production_id = ?' : 'season' in scope ? 'AND b.season_id = ?' : ''
  return all<Budget>(
    `SELECT ${COLUMNS} FROM budgets_budgets b WHERE b.state IN ('approved', 'closed') AND b.year_starts_on <= ? AND date(b.year_starts_on, '+1 year') > ? ${narrow}`,
    query.to, query.from, ...('production' in scope ? [scope.production] : 'season' in scope ? [scope.season] : []))
}

function keysOf(budget: Budget, lineId: string, by: readonly string[]): Keys | null {
  const all: Keys = {
    'production': budget.productionId ?? undefined,
    'season': budget.seasonId ?? undefined,
    'budgets.line': lineId,
    'budgets.department': budget.departmentTermId ?? undefined,
  }
  const keys: Keys = {}
  for (const key of by) {
    const value = all[key as keyof Keys]
    if (value === undefined) return null
    keys[key as keyof Keys] = value
  }
  return keys
}

/** Adds rows that share keys and currency. */
function collect(rows: MeasureRow[], keys: Keys, currency: string, value: number): void {
  const at = rows.find(r => r.currency === currency && JSON.stringify(r.keys) === JSON.stringify(keys))
  if (at) at.value += value
  else rows.push({ keys, currency, value })
}

/** Budgeted or committed (a level): each expense line of the budgets meeting the period, as it stands. */
export async function lineLevel(query: MeasureQuery, figure: 'budgetedMinor' | 'committedMinor'): Answer {
  const budgets = await budgetsFor(query)
  if (budgets === 'unsupported') return budgets
  const rows: MeasureRow[] = []
  for (const budget of budgets) {
    for (const line of (await budgetLines(budget)).lines) {
      if (line.kind !== 'expense') continue
      const keys = keysOf(budget, line.id, query.by)
      if (keys) collect(rows, keys, budget.currency, line.figures[figure])
    }
  }
  return { rows }
}

/** Spent (a sum): Finance entries tagged with an expense line, bills included, within the period, by month if asked. */
export async function spent(query: MeasureQuery): Answer {
  const budgets = await budgetsFor(query)
  if (budgets === 'unsupported') return budgets
  const byMonth = query.by.includes('month')
  const by = query.by.filter(k => k !== 'month')
  const months = byMonth ? monthsOf(query.from, query.to) : [{ month: '', from: query.from, to: query.to }]
  const rows: MeasureRow[] = []
  for (const budget of budgets) await spentOn(rows, budget, { months, by, byMonth })
  return { rows }
}

async function spentOn(rows: MeasureRow[], budget: Budget, on: { months: Month[], by: readonly string[], byMonth: boolean }) {
  const lines = (await budgetLines(budget)).lines.filter(l => l.kind === 'expense')
  for (const m of on.months) {
    const range = await rangeOf(m.from, m.to)
    const totals = await budgetLineTotals(lines.map(l => l.id), { from: range.startsAt, to: range.endsAt })
    for (const line of lines) {
      const keys = keysOf(budget, line.id, on.by)
      const amount = totals.get(line.id) ?? 0
      if (keys && amount) collect(rows, on.byMonth ? { ...keys, month: m.month } : keys, budget.currency, amount)
    }
  }
}

type Month = { month: string, from: string, to: string }

/** The period's calendar months, each clipped to the period. */
function monthsOf(from: string, to: string): Month[] {
  const out: Month[] = []
  const month = (date: string) => date.slice(0, 7) // not-policy: the YYYY-MM of an ISO date
  let first = `${month(from)}-01`
  while (first <= to) {
    const next = `${month(previousDate(first, -32))}-01` // not-policy: past the end of any month
    const last = previousDate(next)
    out.push({ month: month(first), from: first < from ? from : first, to: last < to ? last : to })
    first = next
  }
  return out
}

/** Claims submitted and not yet decided, now: how many, or what they ask for. */
export async function claimsPending(query: MeasureQuery, what: 'count' | 'money'): Answer {
  if (query.scope || query.by.length) return 'unsupported'
  const rows = await all<{ currency: string, n: number, total: number }>(
    "SELECT currency, count(*) AS n, sum(total_minor) AS total FROM budgets_claims WHERE state = 'submitted' GROUP BY currency")
  if (what === 'count') return { rows: [{ keys: {}, value: rows.reduce((a, r) => a + r.n, 0) }] }
  return { rows: rows.map(r => ({ keys: {}, currency: r.currency, value: r.total })) }
}
