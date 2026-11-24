// A spending category's name and the page that edits it.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM budgets_categories WHERE id = ?', id)
    return row ? { title: row.name, to: '/admin/modules/budgets/categories' } : null
  },
}
