// A budget's name and address, wherever records are listed.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM budgets_budgets WHERE id = ?', id)
    return row ? { title: row.name, to: `/console/budgets/${id}` } : null
  },
}
