// Budgets (BC-06 to BC-13): the plan for a production, a department and year, a season or a general
// purpose. Figures are read, never stored: spent from Finance, committed from sub-budgets and requests.
import { z } from 'zod'
import { all, first, localDate, newId, nowMs, refuse, today, useSetting, type UnitView } from '#kit'
import { balances, budgetLineTotals, financeYearOf, rangeOf } from '#modules/finance'
import { listTerms } from '#modules/core'
import { pendingOn } from './pending'

export const SCOPES = ['production', 'department', 'season', 'general'] as const
export const STATES = ['draft', 'proposed', 'approved', 'closed'] as const
export const KINDS = ['expense', 'income'] as const
export type Scope = typeof SCOPES[number]
export type BudgetState = typeof STATES[number]
export type LineKind = typeof KINDS[number]

export interface Budget {
  id: string
  name: string
  scope: Scope
  productionId: string | null
  seasonId: string | null
  departmentTermId: string | null
  yearStartsOn: string
  parentLineId: string | null
  currency: string
  state: BudgetState
  note: string | null
  proposedBy: string | null
  approvedBy: string | null
  approvedAt: number | null
  closedAt: number | null
  createdAt: number
}

export interface Figures {
  budgetedMinor: number
  committedMinor: number
  pendingMinor: number
  /** Expense lines: what the ledger says was spent. Income lines: what has come in. */
  actualMinor: number
  remainingMinor: number
  over: boolean
}

export interface Line {
  id: string
  name: string
  kind: LineKind
  categoryId: string | null
  sortOrder: number
  archivedAt: number | null
  draftMinor: number
  approvedMinor: number | null
  sources: string[]
  figures: Figures
}

export interface SubBudget { id: string, name: string, state: BudgetState, parentLineId: string, totalMinor: number }

const columns = (b: string) => `${b}.id, ${b}.name, ${b}.scope, ${b}.production_id AS productionId, ${b}.season_id AS seasonId,
  ${b}.department_term_id AS departmentTermId, ${b}.year_starts_on AS yearStartsOn, ${b}.parent_line_id AS parentLineId, ${b}.currency,
  ${b}.state, ${b}.note, ${b}.proposed_by AS proposedBy, ${b}.approved_by AS approvedBy, ${b}.approved_at AS approvedAt,
  ${b}.closed_at AS closedAt, ${b}.created_at AS createdAt`

/** The newest amount of one stage on the line `l`, as a scalar subquery. */
const newest = (stage: 'draft' | 'approved', line = 'l.id') =>
  `(SELECT a.amount_minor FROM budgets_line_amounts a WHERE a.line_id = ${line} AND a.stage = '${stage}' ORDER BY a.set_at DESC, a.rowid DESC LIMIT 1)`

/** What a budget in this state counts as budgeted: the approved amount once approved, the draft before. */
const LIVE = new Set<BudgetState>(['approved', 'closed'])

export async function getBudget(id: string | undefined): Promise<Budget | null> {
  return id ? await first<Budget>(`SELECT ${columns('b')} FROM budgets_budgets b WHERE b.id = ?`, id) : null
}

export async function requireBudget(id: string | undefined): Promise<Budget> {
  const budget = await getBudget(id)
  if (!budget) refuse('core.not-found', 'There is no such budget.', { status: 404 })
  return budget!
}

/** The budget a line belongs to, with the line. */
export async function requireLine(lineId: string | undefined): Promise<{ budget: Budget, line: { id: string, name: string, kind: LineKind, archivedAt: number | null } }> {
  const line = lineId ? await first<{ id: string, budgetId: string, name: string, kind: LineKind, archivedAt: number | null }>('SELECT id, budget_id AS budgetId, name, kind, archived_at AS archivedAt FROM budgets_lines WHERE id = ?', lineId) : null
  if (!line) refuse('core.not-found', 'There is no such line.', { status: 404 })
  return { budget: await requireBudget(line!.budgetId), line: line! }
}

/** The line rows of a budget, with their newest amounts and income sources, archived ones last. */
async function lineRows(budgetId: string): Promise<Omit<Line, 'figures'>[]> {
  const rows = await all<Omit<Line, 'figures' | 'sources'> & { sources: string }>(
    `SELECT l.id, l.name, l.kind, l.category_id AS categoryId, l.sort_order AS sortOrder, l.archived_at AS archivedAt,
       coalesce(${newest('draft')}, 0) AS draftMinor, ${newest('approved')} AS approvedMinor,
       (SELECT json_group_array(s.account_key) FROM budgets_line_sources s WHERE s.line_id = l.id) AS sources
     FROM budgets_lines l WHERE l.budget_id = ? ORDER BY l.archived_at IS NOT NULL, l.sort_order, l.name`, budgetId)
  return rows.map(r => ({ ...r, sources: (JSON.parse(r.sources) as string[]).sort() }))
}

/** Budgets funded from any line of this one, with each one's approved expense total. */
export async function subBudgets(budgetId: string): Promise<SubBudget[]> {
  return all<SubBudget>(
    `SELECT b.id, b.name, b.state, b.parent_line_id AS parentLineId,
       coalesce((SELECT sum(${newest('approved')}) FROM budgets_lines l WHERE l.budget_id = b.id AND l.kind = 'expense' AND l.archived_at IS NULL), 0) AS totalMinor
     FROM budgets_budgets b WHERE b.parent_line_id IN (SELECT id FROM budgets_lines WHERE budget_id = ?) ORDER BY b.name`, budgetId)
}

/** The ledger range income lines read when the budget is not a production's: its season, or its year. */
async function incomeRange(budget: Budget): Promise<{ startsAt: number, endsAt: number }> {
  if (budget.seasonId) {
    const season = await first<{ startsOn: string, endsOn: string }>('SELECT starts_on AS startsOn, ends_on AS endsOn FROM core_seasons WHERE id = ?', budget.seasonId)
    if (season) return rangeOf(season.startsOn, season.endsOn)
  }
  const year = await financeYearOf(budget.yearStartsOn)
  return rangeOf(year.startsOn, year.endsOn)
}

/** What has come in on an income line's source accounts, for the budget's production or range. */
async function received(budget: Budget, sources: string[]): Promise<number> {
  if (!sources.length) return 0
  let scope: { productionId: string } | { from: number, to: number }
  if (budget.productionId) scope = { productionId: budget.productionId }
  else {
    const range = await incomeRange(budget)
    scope = { from: range.startsAt, to: range.endsAt }
  }
  const rows = await balances({ systemKeys: sources, ...scope })
  return rows.filter(r => r.currency === budget.currency).reduce((sum, r) => sum + r.creditsMinor - r.debitsMinor, 0)
}

/** What approved requests still hold on each line of a budget: their amount less what has fulfilled them (BC-16). */
async function approvedRequests(budgetId: string): Promise<{ lineId: string, amountMinor: number }[]> {
  return all<{ lineId: string, amountMinor: number }>(
    `SELECT r.line_id AS lineId, sum(r.amount_minor - r.fulfilled_minor) AS amountMinor FROM budgets_spending_requests r
      WHERE r.state = 'approved' AND r.line_id IN (SELECT id FROM budgets_lines WHERE budget_id = ?) GROUP BY r.line_id`, budgetId)
}

/** A budget's lines with their figures (BC-10), committed from sub-budgets (BC-12) and approved requests, and the budgets funded from them. */
export async function budgetLines(budget: Budget): Promise<{ lines: Line[], subBudgets: SubBudget[] }> {
  const rows = await lineRows(budget.id)
  const subs = await subBudgets(budget.id)
  const committed = new Map<string, number>()
  for (const sub of subs) if (LIVE.has(sub.state)) committed.set(sub.parentLineId, (committed.get(sub.parentLineId) ?? 0) + sub.totalMinor)
  for (const r of await approvedRequests(budget.id)) committed.set(r.lineId, (committed.get(r.lineId) ?? 0) + r.amountMinor)
  const pending = await pendingOn(budget.id)
  const tagged = await budgetLineTotals(rows.map(r => r.id))
  const lines: Line[] = []
  for (const row of rows) {
    const budgetedMinor = LIVE.has(budget.state) ? row.approvedMinor ?? 0 : row.draftMinor
    if (row.kind === 'income') {
      const actualMinor = -(tagged.get(row.id) ?? 0) + await received(budget, row.sources)
      lines.push({ ...row, figures: { budgetedMinor, committedMinor: 0, pendingMinor: 0, actualMinor, remainingMinor: budgetedMinor - actualMinor, over: false } })
      continue
    }
    const committedMinor = committed.get(row.id) ?? 0
    const pendingMinor = pending.get(row.id) ?? 0
    const actualMinor = tagged.get(row.id) ?? 0
    const remainingMinor = budgetedMinor - committedMinor - pendingMinor - actualMinor
    lines.push({ ...row, figures: { budgetedMinor, committedMinor, pendingMinor, actualMinor, remainingMinor, over: remainingMinor < 0 } })
  }
  return { lines, subBudgets: subs }
}

export interface Totals { budgetedMinor: number, committedMinor: number, actualMinor: number, remainingMinor: number, incomeBudgetedMinor: number, incomeActualMinor: number }

export function totalsOf(lines: readonly Line[]): Totals {
  const live = lines.filter(l => !l.archivedAt || l.figures.actualMinor || l.figures.committedMinor)
  const sum = (kind: LineKind, key: keyof Figures) => live.filter(l => l.kind === kind).reduce((n, l) => n + (l.figures[key] as number), 0)
  return {
    budgetedMinor: sum('expense', 'budgetedMinor'),
    committedMinor: sum('expense', 'committedMinor') + sum('expense', 'pendingMinor'),
    actualMinor: sum('expense', 'actualMinor'),
    remainingMinor: sum('expense', 'remainingMinor'),
    incomeBudgetedMinor: sum('income', 'budgetedMinor'),
    incomeActualMinor: sum('income', 'actualMinor'),
  }
}

export interface BudgetSummary extends Budget { subject: string | null, totals: Totals }

/** Every budget of a finance year, or of every year, with its totals: the Budgets list. */
export async function listBudgets(filter: { yearStartsOn?: string } = {}): Promise<BudgetSummary[]> {
  const rows = await all<Budget & { subject: string | null }>(
    `SELECT ${columns('b')},
       coalesce((SELECT title FROM core_productions WHERE id = b.production_id), (SELECT name FROM core_seasons WHERE id = b.season_id), (SELECT label FROM core_terms WHERE id = b.department_term_id)) AS subject
     FROM budgets_budgets b ${filter.yearStartsOn ? 'WHERE b.year_starts_on = ?' : ''} ORDER BY b.state = 'closed', b.year_starts_on DESC, b.name`,
    ...(filter.yearStartsOn ? [filter.yearStartsOn] : []))
  const out: BudgetSummary[] = []
  for (const row of rows) out.push({ ...row, totals: totalsOf((await budgetLines(row)).lines) })
  return out
}

/** The finance years budgets exist for, newest first, with the current one always there. */
export async function budgetYears(): Promise<{ current: string, years: string[] }> {
  const current = (await financeYearOf(await today())).startsOn
  const rows = await all<{ year: string }>('SELECT DISTINCT year_starts_on AS year FROM budgets_budgets')
  return { current, years: [...new Set([current, ...rows.map(r => r.year)])].sort().reverse() }
}

export const budgetFields = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's bound
  scope: z.enum(SCOPES),
  productionId: z.string().max(40).optional(), // not-policy: ids are short
  seasonId: z.string().max(40).optional(), // not-policy: ids are short
  departmentTermId: z.string().max(40).optional(), // not-policy: ids are short
  // Any date in the finance year; the year's first day is stored.
  year: z.iso.date().optional(),
  parentLineId: z.string().max(40).nullable().optional(), // not-policy: ids are short
})

/** A department budget is for one of the organisation's departments, not a production's (R3-07). */
export const departments = () => listTerms('core.department', { group: 'organisation' })

type SubjectInput = z.infer<typeof budgetFields> | Omit<z.infer<typeof budgetFields>, 'name'>
type Subject = { name: string | null, yearStartsOn: string }
const yearOf = async (date: string) => (await financeYearOf(date)).startsOn
const field = (key: string, code: string, reason: string): never => refuse(code, reason, { status: 422, fields: { [key]: code } })

/** Each scope's subject: its name and the date its finance year is found from, unless a year was given. */
const SUBJECTS: Record<string, (input: SubjectInput, given: string | null) => Promise<Subject>> = {
  async production(input, given) {
    const row = input.productionId ? await first<{ title: string, firstStartsAt: number | null }>('SELECT title, first_starts_at AS firstStartsAt FROM core_productions WHERE id = ?', input.productionId) : null
    if (!row) return field('productionId', 'budgets.budget.production', 'Choose the production this budget is for.')
    return { name: row.title, yearStartsOn: given ?? await yearOf(row.firstStartsAt ? await localDate(row.firstStartsAt) : await today()) }
  },
  async season(input, given) {
    const row = input.seasonId ? await first<{ name: string, startsOn: string }>('SELECT name, starts_on AS startsOn FROM core_seasons WHERE id = ?', input.seasonId) : null
    if (!row) return field('seasonId', 'budgets.budget.season', 'Choose the season this budget is for.')
    return { name: row.name, yearStartsOn: given ?? await yearOf(row.startsOn) }
  },
  async department(input, given) {
    const row = input.departmentTermId ? (await departments()).find(t => t.id === input.departmentTermId) : null
    if (!row) return field('departmentTermId', 'budgets.budget.department', 'Choose the department this budget is for.')
    const yearStartsOn = given ?? await yearOf(await today())
    return { name: `${row.label} ${yearStartsOn.slice(0, 4)}`, yearStartsOn } // not-policy: the year of a date
  },
}

/** What a new budget is about, its default name and the finance year it falls in. */
export async function subjectOf(input: SubjectInput): Promise<Subject> {
  const given = input.year ? await yearOf(input.year) : null
  const subject = SUBJECTS[input.scope]
  return subject ? subject(input, given) : { name: null, yearStartsOn: given ?? await yearOf(await today()) }
}

/** A parent line must be an expense line, live, of another budget in the same currency that this one does not fund. */
export async function checkParentLine(parentLineId: string | null | undefined, budget: { id: string | null, currency: string }): Promise<void> {
  if (!parentLineId) return
  const code = 'budgets.budget.parent-line'
  const line = await first<{ budgetId: string, kind: string, archivedAt: number | null, currency: string, state: string }>(
    'SELECT l.budget_id AS budgetId, l.kind, l.archived_at AS archivedAt, b.currency, b.state FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id WHERE l.id = ?', parentLineId)
  if (!line || line.kind !== 'expense' || line.archivedAt || line.state === 'closed' || line.currency !== budget.currency)
    refuse(code, 'Choose an expense line of an open budget in the same currency.', { status: 422, fields: { parentLineId: code } })
  if (!budget.id) return
  // Walk up from the parent's budget: meeting this one would make a loop.
  let current: string | null = line!.budgetId
  for (let depth = 0; current && depth < 20; depth++) { // not-policy: deeper than any theatre nests budgets
    if (current === budget.id) refuse(code, 'A budget cannot be funded from its own line, or from a budget it funds.', { status: 422, fields: { parentLineId: code } })
    current = (await first<{ parent: string | null }>('SELECT (SELECT budget_id FROM budgets_lines WHERE id = b.parent_line_id) AS parent FROM budgets_budgets b WHERE b.id = ?', current))?.parent ?? null
  }
}

export async function theatreCurrency(): Promise<string> {
  return await useSetting('core.locale.currency') as string
}

/** Adds an amount row to a line, guarded on the budget still being in `state`. */
export function addAmount(unit: UnitView, input: { lineId: string, budgetId: string, amountMinor: number, stage: 'draft' | 'approved', reason?: string | null, by: string | null, state: BudgetState, at?: number }): void {
  unit.add({
    sql: `INSERT INTO budgets_line_amounts (id, line_id, amount_minor, stage, reason, set_by, set_at)
          SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM budgets_budgets WHERE id = ? AND state = ?)`,
    params: [newId('bga'), input.lineId, input.amountMinor, input.stage, input.reason ?? null, input.by, input.at ?? nowMs(), input.budgetId, input.state],
  }).expect(1, changed())
}

export const changed = () => ({ code: 'budgets.budget.changed', reason: 'Someone else changed this budget a moment ago.', remedy: 'Reload it and try again.' })

/** Income lines read Finance's income accounts by system key. */
export async function checkSources(sources: readonly string[]): Promise<void> {
  if (!sources.length) return
  const rows = await all<{ key: string }>("SELECT system_key AS key FROM finance_accounts WHERE kind = 'income' AND system_key IN (SELECT value FROM json_each(?))", JSON.stringify(sources))
  if (rows.length !== new Set(sources).size) refuse('budgets.line.sources', 'Choose income accounts from the ledger.', { status: 422, fields: { sources: 'budgets.line.sources' } })
}

/** Writes an income line's sources afresh. */
export function setSources(unit: UnitView, lineId: string, sources: readonly string[]): void {
  unit.add({ sql: 'DELETE FROM budgets_line_sources WHERE line_id = ?', params: [lineId] })
  if (sources.length) unit.add({ sql: 'INSERT INTO budgets_line_sources (line_id, account_key) SELECT ?, value FROM json_each(?)', params: [lineId, JSON.stringify([...new Set(sources)])] })
}

/** The figures that make a revision below them need confirming: spent plus committed on the line. */
export async function lineFloor(budget: Budget, lineId: string): Promise<number> {
  const line = (await budgetLines(budget)).lines.find(l => l.id === lineId)
  return line && line.kind === 'expense' ? line.figures.actualMinor + line.figures.committedMinor + line.figures.pendingMinor : 0
}
