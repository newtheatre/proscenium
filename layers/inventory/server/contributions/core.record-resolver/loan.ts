// A loan by its department and window, under the department, so a grant there reaches it; the
// borrower's name stays off the title, which history and search show.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ department_id: string, department: string, due_back_on: string }>(
      'SELECT o.department_id, d.name AS department, o.due_back_on FROM inventory_loans o JOIN inventory_departments d ON d.id = o.department_id WHERE o.id = ?', id)
    return row ? { title: `${row.department} loan, due back ${row.due_back_on}`, to: `/console/inventory/loans/${id}`, parent: { type: 'inventory.department', id: row.department_id } } : null
  },
}
