// A category's name, under its kit department.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string, department_id: string, department: string }>(
      'SELECT c.name, c.department_id, d.name AS department FROM inventory_categories c JOIN inventory_departments d ON d.id = c.department_id WHERE c.id = ?', id)
    return row ? { title: `${row.department}: ${row.name}`, to: '/admin/modules/inventory/departments', parent: { type: 'inventory.department', id: row.department_id } } : null
  },
}
