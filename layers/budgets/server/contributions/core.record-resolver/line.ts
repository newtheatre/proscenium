// A budget line's name, its budget as parent, and the budget's address.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string, budgetId: string, budget: string }>('SELECT l.name, l.budget_id AS budgetId, b.name AS budget FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id WHERE l.id = ?', id)
    return row ? { title: `${row.budget}: ${row.name}`, to: `/console/budgets/${row.budgetId}`, parent: { type: 'budgets.budget', id: row.budgetId } } : null
  },
}
