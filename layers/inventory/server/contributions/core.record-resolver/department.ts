// A kit department's name. A grant on it reaches its categories, items and loans.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM inventory_departments WHERE id = ?', id)
    return row ? { title: row.name, to: '/admin/modules/inventory/departments' } : null
  },
}
