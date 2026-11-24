// BC-37: budgets and their figures as a spreadsheet, one row per line, for a committee member to
// take away. Cells are guarded against formula injection by Finance's toCsv.
import { toCsv } from '#modules/finance'
import { budgetLines, listBudgets } from './budgets'
import { major } from './money'

const COLUMNS = [
  { key: 'budget', label: 'Budget' },
  { key: 'subject', label: 'For' },
  { key: 'scope', label: 'Kind' },
  { key: 'state', label: 'State' },
  { key: 'year', label: 'Year starting' },
  { key: 'line', label: 'Line' },
  { key: 'kind', label: 'Expense or income' },
  { key: 'currency', label: 'Currency' },
  { key: 'budgeted', label: 'Budgeted' },
  { key: 'committed', label: 'Committed' },
  { key: 'pending', label: 'Claimed, awaiting approval' },
  { key: 'actual', label: 'Spent or received' },
  { key: 'remaining', label: 'Remaining' },
] as const

/** Every budget of a finance year, or of every year, with a row for each line and its figures. */
export async function budgetsCsv(yearStartsOn?: string): Promise<{ csv: string, budgets: number }> {
  const budgets = await listBudgets(yearStartsOn ? { yearStartsOn } : {})
  const rows = []
  for (const b of budgets) {
    for (const line of (await budgetLines(b)).lines) {
      const f = line.figures
      rows.push({
        budget: b.name, subject: b.subject ?? '', scope: b.scope, state: b.state, year: b.yearStartsOn,
        line: line.name, kind: line.kind, currency: b.currency,
        budgeted: major(f.budgetedMinor, b.currency), committed: major(f.committedMinor, b.currency), pending: major(f.pendingMinor, b.currency),
        actual: major(f.actualMinor, b.currency), remaining: major(f.remainingMinor, b.currency),
      })
    }
  }
  return { csv: toCsv(rows, COLUMNS), budgets: budgets.length }
}
