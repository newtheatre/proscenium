// What a new budget can be for: productions and seasons without an open budget, departments, and the
// expense lines it could be funded from.
import { all, defineRoute, today } from '#kit'
import { financeYearOf } from '#modules/finance'
import { budgetYears, ORGANISATION } from '../../../budgets'

const DAY = 86_400_000 // not-policy: a day in milliseconds

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'default' }, async () => {
  const current = await financeYearOf(await today())
  const next = (await financeYearOf(new Date(Date.parse(`${current.endsOn}T12:00:00Z`) + DAY).toISOString().slice(0, 10))).startsOn // not-policy: the length of a date
  const open = "state <> 'closed'"
  return {
    productions: await all<{ id: string, label: string }>(`SELECT id, title AS label FROM core_productions WHERE id NOT IN (SELECT production_id FROM budgets_budgets WHERE production_id IS NOT NULL AND ${open}) ORDER BY coalesce(first_starts_at, 0) DESC, title LIMIT 200`), // not-policy: a dropdown's worth
    seasons: await all<{ id: string, label: string }>(`SELECT id, name AS label FROM core_seasons WHERE id NOT IN (SELECT season_id FROM budgets_budgets WHERE season_id IS NOT NULL AND ${open}) ORDER BY starts_on DESC LIMIT 100`), // not-policy: a dropdown's worth
    departments: await all<{ id: string, label: string }>(`SELECT id, label FROM core_terms WHERE vocabulary_key = 'core.department' AND retired_at IS NULL AND ${ORGANISATION} ORDER BY sort, label`),
    parentLines: await all<{ id: string, label: string, budget: string }>(
      `SELECT l.id, l.name AS label, b.name AS budget FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id
        WHERE l.kind = 'expense' AND l.archived_at IS NULL AND b.state <> 'closed' AND b.scope <> 'production' ORDER BY b.name, l.sort_order`),
    // This year first, as the default, then next year's, then any earlier.
    years: [...new Set([current.startsOn, next, ...(await budgetYears()).years])],
  }
})
