// An inspection kind's name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM inventory_inspection_kinds WHERE id = ?', id)
    return row ? { title: row.name, to: '/admin/modules/inventory/inspection-kinds' } : null
  },
}
