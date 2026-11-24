// An item's tag and name, under its category, so a grant on its department reaches it.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ tag: string, name: string, category_id: string }>('SELECT tag, name, category_id FROM inventory_items WHERE id = ?', id)
    return row ? { title: `${row.tag} ${row.name}`, to: `/console/inventory/items/${id}`, parent: { type: 'inventory.category', id: row.category_id } } : null
  },
}
